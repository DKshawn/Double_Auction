import type { NextRequest } from "next/server";
import {
  body,
  createRoomSchema,
  failure,
  loginResponse,
} from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const data = await body(request, createRoomSchema);
    return loginResponse(
      request,
      await (
        await service()
      ).create(data.config, data.password, data.accessKey, data.generator),
      "teacher",
    );
  } catch (error) {
    return failure(error);
  }
}
