import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/shell";
import { TeacherLogin } from "@/components/teacher-login";
import { getServerStatus } from "@/lib/server/config";
import { teacherPageAuthorized } from "@/lib/server/teacher-page-access";
import {
  teacherPageAvailable,
  teacherReturnPath,
} from "@/lib/server/teacher-session";

export default async function TeacherLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const returnTo = teacherReturnPath((await searchParams).next);
  if (await teacherPageAuthorized(returnTo)) redirect(returnTo);
  return (
    <>
      <Header>
        <Link className="button secondary small-button" href="/">
          学生の入室画面
        </Link>
      </Header>
      <main className="narrow-main">
        <TeacherLogin
          returnTo={returnTo}
          ready={getServerStatus().ready && teacherPageAvailable(returnTo)}
        />
      </main>
    </>
  );
}
