import Image from "next/image";
import { Layers3, UsersRound, RefreshCcw } from "lucide-react";
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
              同じ商品を、選んだ制度で取引する。
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
                <p>りんご · 各期の取引量は教員が設定</p>
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
                選べる3つの制度
              </span>
              <span>
                <UsersRound size={17} />
                標準：1市場16人
              </span>
              <span>
                <RefreshCcw size={16} />
                制度・期数を選択
              </span>
            </div>
          </div>
          <div className="join-card">
            <JoinForm initialCode={code?.toUpperCase() ?? ""} />
          </div>
        </section>
        <section className="home-steps" aria-label="実験の流れ">
          {[
            [
              "01",
              "入室して待つ",
              "全員がそろったら教員が市場と役割をランダムに割り当てます。開始後、自分の価値・費用を確認しましょう。",
            ],
            [
              "02",
              "価格を提示する",
              "画面に表示される制度のルールに沿って注文・購入します。毎期の取引可能数は実験の設定によって決まります。",
            ],
            [
              "03",
              "結果を振り返る",
              "各期の利益と、現在の制度の全期の価格を確認。経験によって、市場はどう変わるでしょうか。",
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
