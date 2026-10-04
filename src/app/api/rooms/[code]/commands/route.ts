import { timed } from "@/lib/server/performance";
import type { NextRequest } from "next/server";
import {
  body,
  codeFor,
  commandSchema,
  failure,
  json,
  tokenFor,
} from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const data = await body(request, commandSchema);
    return json(
      await timed("command.total", async () =>
        (await service()).command(code, tokenFor(request, code), data),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
