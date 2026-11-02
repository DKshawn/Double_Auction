"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ServerStatus } from "@/lib/server/config";
import { api, errorMessage } from "@/lib/client";
import { TeacherKeyHelp } from "@/components/teacher-key-help";
import { TeacherPasswordHelp } from "@/components/teacher-password-help";
import { DEFAULT_SETTINGS, type EmhSettings } from "../settings";
import { SettingsFields } from "./settings-fields";

export function EmhCreateForm({ status }: { status: ServerStatus }) {
  const router = useRouter();
  const [title, setTitle] = useState("資産市場実験");
  const [settings, setSettings] = useState<EmhSettings>(() =>
    structuredClone(DEFAULT_SETTINGS),
  );
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
        settings,
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
          1取引 <b>最大30秒</b>
        </span>
        <span>
          休憩 <b>1分</b>
        </span>
      </div>
      <label className="field">
        実験名
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={60}
        />
      </label>
      <SettingsFields
        settings={settings}
        onChange={setSettings}
        disabled={busy}
      />
      <label className="field">
        教員パスワード
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8文字以上で設定"
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
        />
        <TeacherPasswordHelp />
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
          <TeacherKeyHelp />
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
    </form>
  );
}
