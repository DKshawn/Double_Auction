import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, codeFor, failure, json, tokenFor } from "@/lib/server/http";
import { actionBatchSchema } from "@/lib/server/action-log";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const batch = await body(request, actionBatchSchema);
    return json(
      await (
        await service()
      ).recordActions(
        code,
        tokenFor(request, code, "student"),
        batch.entries,
        batch.participantId,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const requestId = z
      .uuid()
      .safeParse(request.nextUrl.searchParams.get("requestId"));
    if (!requestId.success)
      return json({ error: "リクエストIDが正しくありません。" }, 400);
    return json({
      operation: await (
        await service()
      ).operationOutcome(
        code,
        tokenFor(request, code, "student"),
        requestId.data,
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
