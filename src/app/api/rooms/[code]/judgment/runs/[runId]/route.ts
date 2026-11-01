import type { NextRequest } from "next/server";
import { codeFor, failure, json, tokenFor } from "@/lib/server/http";
import { judgmentService } from "@/experiments/judgment/server/service";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string; runId: string }> },
) {
  try {
    const params = await ctx.params,
      code = codeFor(params.code);
    return json(
      await (
        await judgmentService()
      ).run(code, tokenFor(request, code), params.runId),
    );
  } catch (error) {
    return failure(error);
  }
}
