import { emhService } from "@/experiments/emh/server/service";
import { judgmentService } from "@/experiments/judgment/server/service";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, failure, json } from "@/lib/server/http";
import { service } from "@/experiments/double-auction/server/service";

export const runtime = "nodejs";
const schema = z
  .object({ accessKey: z.string().max(256).default("") })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const { accessKey } = await body(request, schema);
    const rooms = [
      ...(await (await service()).listRooms(accessKey)),
      ...(await (await emhService()).listRooms(accessKey)),
      ...(await (await judgmentService()).listRooms(accessKey)),
    ];
    return json({ rooms: rooms.sort((a, b) => b.createdAt - a.createdAt) });
  } catch (error) {
    return failure(error);
  }
}
