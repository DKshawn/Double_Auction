import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, configSchema, failure, loginResponse } from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
export const maxDuration = 30;
const schema = z
  .object({
    config: configSchema,
    password: z.string().min(8).max(128),
    accessKey: z.string().max(256).default(""),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const data = await body(request, schema);
    return loginResponse(
      request,
      await (
        await service()
      ).create(data.config, data.password, data.accessKey),
    );
  } catch (error) {
    return failure(error);
  }
}
