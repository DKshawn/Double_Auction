import { after, type NextRequest } from "next/server";
import { codeFor, failure, sessionFor, tokenFor } from "@/lib/server/http";
import { database } from "@/lib/server/database";
import { AuctionService } from "@/lib/server/service";
import { broker } from "@/lib/server/realtime";
import {
  RoomStreamRotation,
  STREAM_ROTATE_MS,
  STREAM_HANDOFF_GRACE_MS,
  type RotationPlan,
} from "@/lib/room-stream-rotation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const requestedAt = Date.now();
  try {
    const code = codeFor((await ctx.params).code),
      token = tokenFor(request, code);
    const db = await database();
    await new AuctionService(db).view(code, token, sessionFor(request));
    let subscription: Promise<() => Promise<void>> | undefined;
    let cleanup: Promise<void> | undefined;
    let closed = false;
    let rotating = false;
    let periodRotationPlanned = false;
    let rotate: ReturnType<typeof setTimeout> | undefined;
    let handoff: ReturnType<typeof setTimeout> | undefined;
    const rotation = new RoomStreamRotation();
    let finish: () => Promise<void> = async () => {};
    const stream = new ReadableStream<Uint8Array>(
      {
        async start(controller) {
          const encoder = new TextEncoder();
          const abort = () => {
            void finish();
          };
          finish = () => {
            if (cleanup) return cleanup;
            closed = true;
            clearTimeout(rotate);
            clearTimeout(handoff);
            request.signal.removeEventListener("abort", abort);
            // Cancellation may arrive before the subscription's initial read
            // completes. Keep ownership until its unsubscribe is available.
            cleanup = (async () => {
              const stop = await subscription?.catch(() => undefined);
              await stop?.();
            })();
            try {
              controller.close();
            } catch {
              /* Reader already cancelled. */
            }
            return cleanup;
          };
          request.signal.addEventListener("abort", abort, { once: true });
          if (request.signal.aborted) {
            finish();
            return;
          }
          controller.enqueue(encoder.encode("retry: 1500\n\n"));
          const planRotation = (plan: RotationPlan) => {
            if (closed || rotating || periodRotationPlanned) return;
            // Repeated views of the same End stage must not cancel its pending
            // handoff and replace it with the four-minute fallback timer.
            periodRotationPlanned = plan.reason === "period";
            clearTimeout(rotate);
            rotate = setTimeout(
              () => {
                if (closed) return;
                rotating = true;
                if ((controller.desiredSize ?? 0) < 0) {
                  finish();
                  return;
                }
                // Keep streaming until the client has a replacement snapshot.
                controller.enqueue(
                  encoder.encode(
                    `event: rotate\ndata: ${JSON.stringify({ reason: plan.reason })}\n\n`,
                  ),
                );
                handoff = setTimeout(finish, STREAM_HANDOFF_GRACE_MS);
              },
              plan.delay + (plan.reason === "period" ? Math.random() * 500 : 0),
            );
          };
          planRotation({
            delay: Math.max(0, STREAM_ROTATE_MS - (Date.now() - requestedAt)),
            reason: "timeout",
          });
          try {
            subscription = broker(db).subscribe(
              code,
              token,
              (event) => {
                if (closed) return;
                // Bound memory for disconnected or slow readers; reconnect gets a snapshot.
                if ((controller.desiredSize ?? 0) < 0) {
                  finish();
                  return;
                }
                controller.enqueue(
                  encoder.encode(
                    `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
                  ),
                );
                if (
                  event.type === "session-error" &&
                  [401, 404].includes((event.data as { status: number }).status)
                )
                  finish();
              },
              (view) => {
                planRotation(rotation.observe(view, Date.now() - requestedAt));
              },
            );
            await subscription;
            if (closed) await finish();
          } catch {
            await finish();
          }
        },
        cancel() {
          return finish();
        },
      },
      { highWaterMark: 1024 * 1024, size: (chunk) => chunk.byteLength },
    );
    // after() registers this cleanup with the platform's waitUntil lifecycle,
    // including client cancellation. Never leave listener shutdown to a timer
    // that can be suspended as soon as the response closes.
    after(() => finish());
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, no-transform",
        "X-Accel-Buffering": "no",
        Vary: "Cookie",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
