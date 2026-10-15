import type { NextRequest } from "next/server";
import {
  body,
  codeFor,
  deleteRoomSchema,
  failure,
  json,
  roomViewResponse,
  sessionFor,
  tokenFor,
} from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    return roomViewResponse(
      request,
      await (
        await service()
      ).view(code, tokenFor(request, code), sessionFor(request)),
    );
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
    const { accessKey } = await body(request, deleteRoomSchema);
    await (await service()).deleteRoom(code, accessKey);
    return json({ deleted: code });
  } catch (error) {
    return failure(error);
  }
}
