import type { NextRequest } from "next/server";
import { body, failure, loginResponse } from "@/lib/server/http";
import { emhService } from "@/experiments/emh/server/service";
import { createSchema } from "@/experiments/emh/server/validation";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const { title, password, accessKey } = await body(request, createSchema);
    return loginResponse(
      request,
      await (await emhService()).create(title, password, accessKey),
      "teacher",
    );
  } catch (error) {
    return failure(error);
  }
}
