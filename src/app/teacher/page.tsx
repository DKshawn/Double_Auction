import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Header, Footer } from "@/components/shell";
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
      <Header homeHref="/teacher" />
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
        <div className="page-intro">
          <span className="eyebrow">
            <GraduationCap size={18} />
            教員用ページ
          </span>
          <h1>授業に、小さな市場を。</h1>
          <p>同じ需要と供給のもとで、選択した取引制度を実施します。</p>
        </div>
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
        <div className="demo-entry-link">
          <span>授業の前に、ひとりで操作を確認</span>
          <Link href="/demo">ひとりデモを試す</Link>
          <small>実験の設定から開始。仮想参加者が自動で入室します。</small>
        </div>
      </main>
      <Footer />
    </>
  );
}
