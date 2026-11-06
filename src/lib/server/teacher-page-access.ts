import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  TEACHER_SESSION_COOKIE,
  teacherPageAvailable,
  teacherReturnPath,
  validTeacherSession,
} from "./teacher-session";

export async function teacherPageAuthorized(returnTo: string) {
  const token = (await cookies()).get(TEACHER_SESSION_COOKIE)?.value;
  return teacherPageAvailable(returnTo) && validTeacherSession(token);
}

export async function requireTeacherPage(returnTo: string) {
  if (!(await teacherPageAuthorized(returnTo)))
    redirect(
      `/teacher/login?next=${encodeURIComponent(teacherReturnPath(returnTo))}`,
    );
}
