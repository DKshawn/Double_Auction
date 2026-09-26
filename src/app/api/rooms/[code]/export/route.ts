import type { NextRequest } from "next/server";
import { exportData } from "@/lib/server/export";
import { codeFor, failure, NO_STORE, tokenFor } from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const kind = request.nextUrl.searchParams.get("kind") || "trades";
    const { room, events, now } = await (
      await service()
    ).export(code, tokenFor(request, code));
    const result = exportData(room, events, now, kind);
    return new Response(result.content, {
      headers: {
        ...NO_STORE,
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="auction-${code}-${kind.replace(/[^a-z]/g, "")}.${result.extension}"`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
