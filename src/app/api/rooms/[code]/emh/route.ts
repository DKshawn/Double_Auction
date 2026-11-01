import type { NextRequest } from "next/server";
import { body, codeFor, failure, json, tokenFor } from "@/lib/server/http";
import { emhService } from "@/experiments/emh/server/service";
import {
  commandSchema,
  requestScope,
} from "@/experiments/emh/server/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };
async function handle(request: NextRequest, ctx: Context, write: boolean) {
  try {
    const code = codeFor((await ctx.params).code);
    const { role, market } = requestScope(request);
    const input = write ? await body(request, commandSchema) : undefined;
    const { state, error } = await (
      await emhService()
    ).request(code, tokenFor(request, code, role), role, market, input);
    return json(
      error ? { state, error: error.message } : { state },
      error?.status ?? 200,
    );
  } catch (error) {
    return failure(error);
  }
}
export const GET = (request: NextRequest, ctx: Context) =>
  handle(request, ctx, false);
export const POST = (request: NextRequest, ctx: Context) =>
  handle(request, ctx, true);
