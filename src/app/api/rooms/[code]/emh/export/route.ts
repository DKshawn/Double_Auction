import type { NextRequest } from "next/server";
import { codeFor, failure, NO_STORE, tokenFor } from "@/lib/server/http";
import { emhService } from "@/experiments/emh/server/service";
import { requestScope } from "@/experiments/emh/server/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const { role, market } = requestScope(request);
    const kind = request.nextUrl.searchParams.get("kind") ?? "trades";
    const file = await (
      await emhService()
    ).export(code, tokenFor(request, code, role), role, kind, market);
    return new Response(file.body, {
      headers: {
        ...NO_STORE,
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="EMH-${code}-${market ?? "all"}-${kind}.${file.extension}"`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
