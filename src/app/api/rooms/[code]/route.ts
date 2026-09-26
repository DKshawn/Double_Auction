import type { NextRequest } from "next/server";
import { codeFor, failure, json, tokenFor } from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    return json(await (await service()).view(code, tokenFor(request, code)));
  } catch (error) {
    return failure(error);
  }
}
