import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Header } from "@/components/shell";
import { TeacherForm } from "@/components/teacher-form";
import { getServerStatus } from "@/lib/server/config";
import { pptStudySettings } from "@/lib/server/study";
import { teacherRoomHref } from "@/lib/room-navigation";

export default async function Teacher({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; legacy?: string; room?: string }>;
}) {
  const { code, legacy, room } = await searchParams;
  const returnRoom = room && /^[A-Z2-9]{6}$/.test(room) ? room : undefined;
  return (
    <>
      <Header homeHref="/teacher">
        <Link className="button demo-entry-button" href="/demo">
          Demo Model
        </Link>
      </Header>
      <main
        className={
          legacy === "1" ? "narrow-main" : "narrow-main teacher-setup-main"
        }
      >
        <Link className="back-link" href="/">
          <ArrowLeft size={15} />
          学生の入室画面へ
        </Link>
        {returnRoom && (
          <Link className="back-link" href={teacherRoomHref(returnRoom)}>
            ルーム {returnRoom} に戻る
          </Link>
        )}
        <h1 className="eyebrow teacher-entry-heading">
          <GraduationCap size={18} />
          教員用ページ
        </h1>
        <TeacherForm
          initialCode={code}
          initialTab={returnRoom ? "manage" : undefined}
          status={getServerStatus()}
          legacy={legacy === "1"}
          conditionPreset={{
            label: "Default",
            settings: pptStudySettings(),
          }}
        />
      </main>
    </>
  );
}
