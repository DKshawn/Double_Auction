import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, failure, json } from "@/lib/server/http";
import { service } from "@/lib/server/service";

export const runtime = "nodejs";
const schema = z
  .object({ accessKey: z.string().max(256).default("") })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const { accessKey } = await body(request, schema);
    return json({ rooms: await (await service()).listRooms(accessKey) });
  } catch (error) {
    return failure(error);
  }
}
