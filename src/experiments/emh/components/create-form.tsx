"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ServerStatus } from "@/lib/server/config";
import { api, errorMessage } from "@/lib/client";

export function EmhCreateForm({ status }: { status: ServerStatus }) {
  const router = useRouter();
  const [title, setTitle] = useState("資産市場実験");
  const [password, setPassword] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ code: string }>("/api/emh/rooms", {
        title,
        password,
        accessKey,
      });
      router.push(`/room/${result.code}?entry=teacher`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <form className="emh-create" onSubmit={submit}>
      <h1>EMH · 資産市場実験</h1>
      <div className="experiment-defaults">
        <span>
          <b>6</b> ラウンド
        </span>
        <span>
          A・B 期 <b>各4分</b>
        </span>
        <span>
          <b>約9人</b> / 市場
        </span>
      </div>
      <p className="muted">
        入室した全員を自動で分け、各市場に3タイプをできるだけ均等に割り当てます。配当条件は開始後、各自の画面に表示されます。
      </p>
      <label className="field">
        実験名
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={60}
        />
      </label>
      <label className="field">
        教員パスワード
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
        />
        <span className="muted small">
          再入室に使います。8文字以上で設定してください。
        </span>
      </label>
      {status.keyRequired && (
        <label className="field">
          教員用キー
          <input
            type="password"
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            required
            maxLength={256}
            autoComplete="off"
          />
        </label>
      )}
      {!status.ready && (
        <p role="alert" className="error-message">
          管理者が接続設定を完了してから作成してください。
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={busy || !status.ready}>
        {busy ? "作成中…" : "ルームを作成"}
      </button>
      <Link href="/emh/demo">練習する</Link>
    </form>
  );
}
