"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ServerStatus } from "@/lib/server/config";
import { api, errorMessage } from "@/lib/client";
import { TeacherPasswordHelp } from "@/components/teacher-password-help";
import type { Settings, Study } from "../types";
import { SettingsFields } from "./settings-fields";
import { JUDGMENT_NAME } from "../constants";
export function JudgmentCreateForm({
  status,
  studies,
}: {
  status: ServerStatus;
  studies: Study[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>({
    studyIds: [],
    randomizeExperiments: false,
    randomizeChoices: false,
  });
  const [title, setTitle] = useState(JUDGMENT_NAME),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ code: string }>("/api/judgment/rooms", {
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
    <>
      <form className="judgment-create" onSubmit={create}>
        <h1>{JUDGMENT_NAME}</h1>
        <SettingsFields
          settings={settings}
          studies={studies}
          onChange={setSettings}
          disabled={busy}
        />
        <div className="judgment-room-fields">
          <label className="field">
            実験名
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              required
            />
          </label>
          <label className="field">
            教員パスワード
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8文字以上で設定"
              minLength={8}
              maxLength={128}
              required
              autoComplete="new-password"
            />
            <TeacherPasswordHelp />
          </label>
        </div>
        {!status.ready && (
          <p className="error-message" role="alert">
            管理者が接続設定を完了してから作成してください。
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          disabled={busy || !status.ready || !settings.studyIds.length}
        >
          {busy ? "処理中…" : "ルームを作成"}
        </button>
      </form>
    </>
  );
}
