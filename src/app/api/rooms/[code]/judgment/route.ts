import type { NextRequest } from "next/server";
import {
  body,
  codeFor,
  failure,
  json,
  sessionFor,
  tokenFor,
} from "@/lib/server/http";
import { judgmentService } from "@/experiments/judgment/server/service";
import { commandSchema } from "@/experiments/judgment/server/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const code = codeFor((await ctx.params).code),
      service = await judgmentService();
    return json(
      sessionFor(request) === "teacher"
        ? await service.teacherView(code, tokenFor(request, code))
        : await service.studentView(code, tokenFor(request, code)),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const code = codeFor((await ctx.params).code);
    return json(
      await (
        await judgmentService()
      ).command(
        code,
        tokenFor(request, code),
        await body(request, commandSchema),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
