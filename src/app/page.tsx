import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Layers3,
  UsersRound,
  RefreshCcw,
  ArrowRight,
} from "lucide-react";
import { GOODS } from "@/lib/catalog";
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
              買い手と売り手になって、価格を提示。
              <br />
              みんなの取引が、ひとつの市場をつくります。
            </p>
            <div className="fruit-showcase">
              {GOODS.map((good, i) => (
                <div className={`fruit-tile fruit-${good.id}`} key={good.id}>
                  <span className="fruit-index">0{i + 1}</span>
                  <Image
                    src={good.image}
                    alt={good.name}
                    width={170}
                    height={170}
                    priority
                  />
                  <div>
                    <b>{good.name}</b>
                    <span>
                      独立した市場
                      <ArrowUpRight size={13} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hero-facts">
              <span>
                <Layers3 size={17} />
                3つの商品
              </span>
              <span>
                <UsersRound size={17} />
                2つの役割
              </span>
              <span>
                <RefreshCcw size={16} />
                繰り返して学ぶ
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
              "取引したい商品を選び、注文を出します。相手の価格を受け入れて取引することもできます。",
            ],
            [
              "03",
              "結果を振り返る",
              "各ラウンドの利益や価格の動きを確認。取引を繰り返すと、市場はどう変わるでしょうか。",
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
