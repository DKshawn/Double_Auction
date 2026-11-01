import type { NextRequest } from "next/server";
import { body, codeFor, failure, json, tokenFor } from "@/lib/server/http";
import { judgmentService } from "@/experiments/judgment/server/service";
import { submissionSchema } from "@/experiments/judgment/server/validation";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string; runId: string }> },
) {
  try {
    const params = await ctx.params,
      code = codeFor(params.code);
    return json(
      await (
        await judgmentService()
      ).run(
        code,
        tokenFor(request, code),
        params.runId,
        await body(request, submissionSchema),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
