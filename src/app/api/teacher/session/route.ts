import { NextRequest } from "next/server";
import { z } from "zod";
import { body, failure, json } from "@/lib/server/http";
import {
  createTeacherSession,
  TEACHER_SESSION_COOKIE,
  TEACHER_SESSION_SECONDS,
} from "@/lib/server/teacher-session";

export const runtime = "nodejs";
const loginSchema = z.object({ accessKey: z.string().max(256) }).strict();

export async function POST(request: NextRequest) {
  try {
    const { accessKey } = await body(request, loginSchema);
    const token = createTeacherSession(accessKey);
    const response = json({ authenticated: true });
    response.cookies.set(TEACHER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: TEACHER_SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await body(request, z.object({}).strict());
    const response = json({ authenticated: false });
    response.cookies.set(TEACHER_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
