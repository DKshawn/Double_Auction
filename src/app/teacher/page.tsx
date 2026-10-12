import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Header, Footer } from "@/components/shell";
import { TeacherForm } from "@/components/teacher-form";
import { getServerStatus } from "@/lib/server/config";
import { pptStudySettings } from "@/lib/server/study";

export default async function Teacher({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; legacy?: string }>;
}) {
  const { code, legacy } = await searchParams;
  return (
    <>
      <Header />
      <main className="narrow-main">
        <Link className="back-link" href="/">
          <ArrowLeft size={15} />
          学生の入室画面へ
        </Link>
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
          status={getServerStatus()}
          legacy={legacy === "1"}
          conditionPreset={{
            label: "既存 PPT プリセット",
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
