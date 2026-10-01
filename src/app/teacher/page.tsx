import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Header, Footer } from "@/components/shell";
import { TeacherForm } from "@/components/teacher-form";
import { getServerStatus } from "@/lib/server/config";

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
          <p>同じ需要と供給のもとで、3つの取引制度を比較します。</p>
        </div>
        <TeacherForm
          initialCode={code}
          status={getServerStatus()}
          legacy={legacy === "1"}
        />
        <div className="demo-entry-link">
          <span>授業の前に、ひとりで操作を確認</span>
          <Link href="/demo">ひとりデモを試す</Link>
          <small>ルームの作成や参加者の入室は不要です。</small>
        </div>
      </main>
      <Footer />
    </>
  );
}
