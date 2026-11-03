import Link from "next/link";
import { Header } from "@/components/shell";
import { JoinForm } from "@/components/join-form";
import { DemoEntryLink } from "@/components/demo-entry-link";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <>
      <Header className="home-header">
        <DemoEntryLink />
        <Link className="button secondary small-button" href="/teacher">
          教員用ページ
        </Link>
      </Header>
      <main className="home-main">
        <section className="home-grid">
          <div className="home-story">
            <h1>
              体験から、
              <br />
              <em>経済学</em>を学ぼう。
            </h1>
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
              "教員の説明に沿って、画面の操作を進めます。",
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
    </>
  );
}
