import Link from "next/link";
import { Header } from "@/components/shell";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="loading-state">
        <h1>ページが見つかりません</h1>
        <p>ルームコードまたはリンクを確認してください。</p>
        <Link className="button primary" href="/">
          ホームに戻る
        </Link>
      </main>
    </>
  );
}
