import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  body,
  codeFor,
  failure,
  loginResponse,
  tokenFor,
} from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
const schema = z
  .object({
    nickname: z.string().trim().min(1).max(20),
    pin: z.string().regex(/^\d{6}$/),
  })
  .strict();
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const { nickname, pin } = await body(request, schema);
    return loginResponse(
      request,
      await (
        await service()
      ).join(code, nickname, pin, tokenFor(request, code)),
    );
  } catch (error) {
    return failure(error);
  }
}
