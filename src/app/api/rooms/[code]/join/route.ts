import { experimentFor } from "@/lib/server/experiment-registry";
import { emhService } from "@/experiments/emh/server/service";
import { judgmentService } from "@/experiments/judgment/server/service";
import type { NextRequest } from "next/server";
import {
  body,
  codeFor,
  failure,
  loginResponse,
  tokenFor,
  joinSchema,
} from "@/lib/server/http";
import { service } from "@/experiments/double-auction/server/service";

export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const { nickname, pin } = await body(request, joinSchema);
    if ((await experimentFor(code)) === "judgment")
      return loginResponse(
        request,
        await (
          await judgmentService()
        ).login(code, { role: "student", studentId: nickname, pin }),
        "student",
      );
    if ((await experimentFor(code)) === "emh")
      return loginResponse(
        request,
        await (
          await emhService()
        ).login(code, { role: "student", nickname, pin }),
        "student",
      );
    return loginResponse(
      request,
      await (
        await service()
      ).join(code, nickname, pin, tokenFor(request, code, "student")),
      "student",
    );
  } catch (error) {
    return failure(error);
  }
}
