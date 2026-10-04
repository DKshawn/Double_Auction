import type { NextRequest } from "next/server";
import { codeFor, failure, tokenFor } from "@/lib/server/http";
import { database } from "@/lib/server/database";
import { AuctionService } from "@/lib/server/service";
import { broker } from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code),
      token = tokenFor(request, code);
    const db = await database();
    await new AuctionService(db).view(code, token);
    let stop: (() => void) | undefined;
    let closed = false;
    let rotate: ReturnType<typeof setTimeout>;
    let finish: () => void = () => {};
    const stream = new ReadableStream<Uint8Array>(
      {
        async start(controller) {
          const encoder = new TextEncoder();
          finish = () => {
            if (closed) return;
            closed = true;
            clearTimeout(rotate);
            stop?.();
            request.signal.removeEventListener("abort", finish);
            try {
              controller.close();
            } catch {
              /* Reader already cancelled. */
            }
          };
          request.signal.addEventListener("abort", finish, { once: true });
          if (request.signal.aborted) {
            finish();
            return;
          }
          controller.enqueue(encoder.encode("retry: 1500\n\n"));
          try {
            stop = await broker(db).subscribe(code, token, (event) => {
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
            });
            if (closed) stop();
            else rotate = setTimeout(finish, 240_000 + Math.random() * 15_000);
          } catch {
            finish();
          }
        },
        cancel() {
          finish();
        },
      },
      { highWaterMark: 1024 * 1024, size: (chunk) => chunk.byteLength },
    );
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
