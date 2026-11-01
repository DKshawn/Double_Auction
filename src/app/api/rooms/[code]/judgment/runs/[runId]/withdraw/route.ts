import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, codeFor, failure, json, tokenFor } from "@/lib/server/http";
import { judgmentService } from "@/experiments/judgment/server/service";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string; runId: string }> },
) {
  try {
    const params = await ctx.params,
      code = codeFor(params.code);
    await body(request, z.object({}).strict());
    return json(
      await (
        await judgmentService()
      ).run(code, tokenFor(request, code), params.runId, "withdraw"),
    );
  } catch (error) {
    return failure(error);
  }
}
