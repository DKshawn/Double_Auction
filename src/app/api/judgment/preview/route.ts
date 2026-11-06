import type { NextRequest } from "next/server";
import { body, failure, json } from "@/lib/server/http";
import { requireDemoTeacher } from "@/lib/server/teacher-session";
import { AuctionError } from "@/lib/server/errors";
import { previewSchema } from "@/experiments/judgment/server/validation";
import { preview, AppError } from "@/experiments/judgment/server/core";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const { settings, accessKey } = await body(request, previewSchema);
    requireDemoTeacher(request, accessKey);
    return json({ protocols: preview(settings) });
  } catch (error) {
    return failure(
      error instanceof AppError
        ? new AuctionError(error.message, error.status)
        : error,
    );
  }
}
