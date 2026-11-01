import type { NextRequest } from "next/server";
import { body, failure, loginResponse } from "@/lib/server/http";
import { judgmentService } from "@/experiments/judgment/server/service";
import { createSchema } from "@/experiments/judgment/server/validation";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    return loginResponse(
      request,
      await (await judgmentService()).create(await body(request, createSchema)),
      "teacher",
    );
  } catch (error) {
    return failure(error);
  }
}
