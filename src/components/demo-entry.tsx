"use client";

import dynamic from "next/dynamic";

const DemoRoom = dynamic(() => import("./demo-room"), {
  ssr: false,
  loading: () => (
    <main className="narrow-main">
      <p role="status">ひとりデモを準備しています…</p>
    </main>
  ),
});

export function DemoEntry() {
  return <DemoRoom />;
}
