"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading-state">
      <h1>画面を読み込めませんでした</h1>
      <p>通信状況を確認して、もう一度お試しください。</p>
      <button className="button primary" onClick={reset}>
        もう一度試す
      </button>
    </main>
  );
}
