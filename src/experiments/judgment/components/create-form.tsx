"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ServerStatus } from "@/lib/server/config";
import { api, errorMessage } from "@/lib/client";
import type { PreviewProtocol, Settings, Study } from "../types";
import { SettingsFields } from "./settings-fields";
import { JudgmentPreview } from "./preview";
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
  const [title, setTitle] = useState("判断ラボ"),
    [password, setPassword] = useState(""),
    [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<PreviewProtocol[] | null>(null);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ code: string }>("/api/judgment/rooms", {
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
  async function showPreview() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ protocols: PreviewProtocol[] }>(
        "/api/judgment/preview",
        { settings, accessKey },
      );
      setPreview(result.protocols);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="judgment-create" onSubmit={create}>
        <h1>判断ラボ</h1>
        <SettingsFields
          settings={settings}
          studies={studies}
          onChange={setSettings}
          disabled={busy}
        />
        <button
          type="button"
          className="button secondary"
          disabled={
            busy ||
            !settings.studyIds.length ||
            (status.keyRequired && !accessKey)
          }
          onClick={() => void showPreview()}
        >
          学生画面をプレビュー
        </button>
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
              minLength={8}
              maxLength={128}
              required
              autoComplete="new-password"
            />
            <span className="field-help">
              再入室用に8文字以上で設定してください。
            </span>
          </label>
          {status.keyRequired && (
            <label className="field">
              教員用キー
              <input
                type="password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                maxLength={256}
                autoComplete="off"
                required
              />
            </label>
          )}
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
      {preview && (
        <JudgmentPreview protocols={preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
