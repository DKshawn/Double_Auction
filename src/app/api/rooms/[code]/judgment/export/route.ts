import { NextResponse, type NextRequest } from "next/server";
import { codeFor, failure, NO_STORE, tokenFor } from "@/lib/server/http";
import { AuctionError } from "@/lib/server/errors";
import { judgmentService } from "@/experiments/judgment/server/service";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code),
      format = request.nextUrl.searchParams.get("format") ?? "json";
    if (format !== "csv" && format !== "json")
      throw new AuctionError("形式を確認してください。");
    const result = await (
      await judgmentService()
    ).export(code, tokenFor(request, code), format);
    return new NextResponse(
      typeof result === "string" ? result : JSON.stringify(result, null, 2),
      {
        headers: {
          ...NO_STORE,
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="judgment-${code}.${format}"`,
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
