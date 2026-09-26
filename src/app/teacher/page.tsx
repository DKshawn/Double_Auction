import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Header, Footer } from "@/components/shell";
import { TeacherForm } from "@/components/teacher-form";

export default async function Teacher({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
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
          <p>3つの市場で、価格と取引数量の変化を観察します。</p>
        </div>
        <TeacherForm initialCode={code} />
      </main>
      <Footer />
    </>
  );
}
