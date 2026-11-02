import type { NextRequest } from "next/server";
import { body, failure, loginResponse } from "@/lib/server/http";
import { judgmentService } from "@/experiments/judgment/server/service";
import { createSchema } from "@/experiments/judgment/server/validation";
import { teacherAccessKey } from "@/lib/server/teacher-session";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const data = await body(request, createSchema);
    data.accessKey = teacherAccessKey(request, data.accessKey);
    return loginResponse(
      request,
      await (await judgmentService()).create(data),
      "teacher",
    );
  } catch (error) {
    return failure(error);
  }
}
