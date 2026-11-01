import type { NextRequest } from "next/server";
import { codeFor, failure, json } from "@/lib/server/http";
import { experimentFor } from "@/lib/server/experiment-registry";
import { AuctionError } from "@/lib/server/errors";
export const runtime = "nodejs";
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const experiment = await experimentFor(codeFor((await ctx.params).code));
    if (!experiment) throw new AuctionError("ルームが見つかりません。", 404);
    return json({ experiment });
  } catch (error) {
    return failure(error);
  }
}
