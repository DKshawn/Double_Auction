import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  TEACHER_SESSION_COOKIE,
  teacherReturnPath,
  validTeacherSession,
} from "./teacher-session";

export async function teacherPageAuthorized() {
  return validTeacherSession(
    (await cookies()).get(TEACHER_SESSION_COOKIE)?.value,
  );
}

export async function requireTeacherPage(returnTo: string) {
  if (!(await teacherPageAuthorized()))
    redirect(
      `/teacher/login?next=${encodeURIComponent(teacherReturnPath(returnTo))}`,
    );
}
