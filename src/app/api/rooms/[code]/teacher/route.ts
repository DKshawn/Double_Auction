import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, codeFor, failure, loginResponse } from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const { password } = await body(
      request,
      z.object({ password: z.string().min(8).max(128) }).strict(),
    );
    return loginResponse(
      request,
      await (await service()).recoverTeacher(code, password),
    );
  } catch (error) {
    return failure(error);
  }
}
