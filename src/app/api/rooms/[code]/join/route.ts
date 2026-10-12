import type { NextRequest } from "next/server";
import {
  body,
  codeFor,
  failure,
  loginResponse,
  tokenFor,
  joinSchema,
} from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const { nickname, pin } = await body(request, joinSchema);
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
