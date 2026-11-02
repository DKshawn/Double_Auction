"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ServerStatus } from "@/lib/server/config";
import { api, errorMessage } from "@/lib/client";
import { TeacherPasswordHelp } from "@/components/teacher-password-help";
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type EmhSettings,
} from "../settings";
import { SettingsFields } from "./settings-fields";

export function EmhCreateForm({
  status,
  initialTitle,
  initialSettings,
  onCreateDemo,
}: {
  status: ServerStatus;
  initialTitle?: string;
  initialSettings?: EmhSettings;
  onCreateDemo?: (title: string, settings: EmhSettings) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle ?? "資産市場実験");
  const [settings, setSettings] = useState<EmhSettings>(() =>
    structuredClone(initialSettings ?? DEFAULT_SETTINGS),
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (onCreateDemo) {
        const parsed = settingsSchema.safeParse(settings);
        if (!parsed.success || !title.trim() || title.trim().length > 60)
          throw new Error(
            "実験名・人数・比率・証券数・時間を確認してください。",
          );
        onCreateDemo(title.trim(), parsed.data);
        return;
      }
      const result = await api<{ code: string }>("/api/emh/rooms", {
        title,
        password,
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
      {!onCreateDemo && (
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
      )}
      {!onCreateDemo && !status.ready && (
        <p role="alert" className="error-message">
          管理者が接続設定を完了してから作成してください。
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        disabled={busy || (!onCreateDemo && !status.ready)}
      >
        {busy ? "作成中…" : onCreateDemo ? "デモルームを作成" : "ルームを作成"}
      </button>
    </form>
  );
}
