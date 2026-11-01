import { JUDGMENT_NAME } from "@/experiments/judgment/constants";
import Link from "next/link";
import { Layers3, UsersRound, RefreshCcw } from "lucide-react";
import { Header } from "@/components/shell";
import { JoinForm } from "@/components/join-form";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <>
      <Header>
        <Link href="/teacher">教員用ページ</Link>
      </Header>
      <main className="home-main">
        <section className="home-grid">
          <div className="home-story">
            <div className="eyebrow">
              <span />
              体験する、実験経済学
            </div>
            <h1>
              体験から、
              <br />
              <em>経済学</em>を学ぼう。
            </h1>
            <p className="hero-description">
              取引や判断の実験に、教室のみんなで参加する。
              <br />
              自分の選択と実験の結果を振り返ります。
            </p>
            <div className="platform-home-experiments">
              <div>
                <h2>Double Auction</h2>
                <p>取引制度と価格形成</p>
              </div>
              <div>
                <h2>EMH</h2>
                <p>情報と資産価格</p>
              </div>
              <div>
                <h2>{JUDGMENT_NAME}</h2>
                <p>確率判断と意思決定</p>
              </div>
            </div>
            <div className="hero-facts">
              <span>
                <Layers3 size={17} />
                3つの実験
              </span>
              <span>
                <UsersRound size={17} />
                教室のみんなで参加
              </span>
              <span>
                <RefreshCcw size={16} />
                選択と結果を記録
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
              "ルームコードで参加。開始後、自分に割り当てられた条件を確認しましょう。",
            ],
            [
              "02",
              "実験に参加する",
              "画面に表示されるルールに沿って、取引や課題に取り組みます。",
            ],
            [
              "03",
              "結果を振り返る",
              "実験が終わったら、授業で結果を確認しましょう。",
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
      <div className="site-footer platform-guide-links">
        <Link href="/guide">Double Auction のルール</Link>
        <Link href="/emh/guide">EMH のルール</Link>
      </div>
    </>
  );
}
