import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, codeFor, failure, json, tokenFor } from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const deleteSchema = z
  .object({
    password: z.string().min(8).max(128),
    accessKey: z.string().max(256).default(""),
  })
  .strict();
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

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const { password, accessKey } = await body(request, deleteSchema);
    await (await service()).deleteRoom(code, password, accessKey);
    return json({ deleted: code });
  } catch (error) {
    return failure(error);
  }
}
