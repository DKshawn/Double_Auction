import Image from "next/image";
import Link from "next/link";
import { Layers3, UsersRound, RefreshCcw, ArrowRight } from "lucide-react";
import { INSTITUTIONS } from "@/lib/study-rules";
import { Footer, Header } from "@/components/shell";
import { JoinForm } from "@/components/join-form";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <>
      <Header />
      <main className="home-main">
        <section className="home-grid">
          <div className="home-story">
            <div className="eyebrow">
              <span />
              体験する、実験経済学
            </div>
            <h1>
              取引から、
              <br />
              <em>市場</em>を学ぼう。
            </h1>
            <p className="hero-description">
              同じ商品を、3つの制度で取引する。
              <br />
              みんなの取引が、ひとつの市場をつくります。
            </p>
            <div className="study-home-product">
              <Image
                src="/fruits/apple.jpg"
                alt="取引する商品：りんご"
                width={150}
                height={150}
                priority
              />
              <div>
                <p>りんご · 各自2単位／期</p>
                {Object.entries(INSTITUTIONS).map(([id, institution]) => (
                  <div className="study-home-protocol" key={id}>
                    <b>{institution.short}</b>
                    <span>{institution.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="hero-facts">
              <span>
                <Layers3 size={17} />
                3つの制度
              </span>
              <span>
                <UsersRound size={17} />
                1市場16人
              </span>
              <span>
                <RefreshCcw size={16} />
                各5期・全15期
              </span>
            </div>
          </div>
          <div className="join-card">
            <JoinForm initialCode={code?.toUpperCase() ?? ""} />
            <div className="teacher-link-row">
              <span>授業を始める教員の方はこちら</span>
              <Link href="/teacher">
                実験を作成
                <ArrowRight size={15} />
              </Link>
            </div>
            <div className="demo-entry-link">
              <span>ひとりで操作を確認したい方へ</span>
              <Link href="/demo">
                ひとりデモを試す <ArrowRight size={15} />
              </Link>
              <small>ログイン不要・仮想参加者15人と取引</small>
            </div>
          </div>
        </section>
        <section className="home-steps" aria-label="実験の流れ">
          {[
            [
              "01",
              "役割を確認する",
              "買い手か売り手に自動で振り分けられます。自分だけの価値・費用を確認しましょう。",
            ],
            [
              "02",
              "価格を提示する",
              "画面に表示される制度のルールに沿って注文・購入します。同じ商品を毎期2単位まで取引できます。",
            ],
            [
              "03",
              "結果を振り返る",
              "各期の利益や全期間の価格の動きを確認。制度や経験によって、市場はどう変わるでしょうか。",
            ],
          ].map(([number, title, text]) => (
            <article key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
