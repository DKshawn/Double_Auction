import type { NextRequest } from "next/server";
import { body, codeFor, failure, json, tokenFor } from "@/lib/server/http";
import { teacherAccessKey } from "@/lib/server/teacher-session";
import { judgmentService } from "@/experiments/judgment/server/service";
import { settingsSchema } from "@/experiments/judgment/server/validation";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    teacherAccessKey(request);
    const code = codeFor((await ctx.params).code);
    return json(
      await (
        await judgmentService()
      ).preview(
        code,
        tokenFor(request, code),
        await body(request, settingsSchema),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
