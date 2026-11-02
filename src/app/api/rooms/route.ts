import { teacherAccessKey } from "@/lib/server/teacher-session";
import type { NextRequest } from "next/server";
import { body, failure, loginResponse } from "@/lib/server/http";
import { createRoomSchema } from "@/experiments/double-auction/server/validation";
import { service } from "@/experiments/double-auction/server/service";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const data = await body(request, createRoomSchema);
    const accessKey = teacherAccessKey(request, data.accessKey);
    return loginResponse(
      request,
      await (
        await service()
      ).create(data.config, data.password, accessKey, data.generator),
      "teacher",
    );
  } catch (error) {
    return failure(error);
  }
}
