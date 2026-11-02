"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/shell";
import { api, errorMessage } from "@/lib/client";
import { JUDGMENT_NAME } from "../constants";
import type { PreviewProtocol, Settings, Study } from "../types";
import { JudgmentPreview } from "./preview";
import { SettingsFields } from "./settings-fields";

export function JudgmentDemoEntry({ studies }: { studies: Study[] }) {
  const [settings, setSettings] = useState<Settings>({
    studyIds: [],
    randomizeExperiments: false,
    randomizeChoices: false,
  });
  const [protocols, setProtocols] = useState<PreviewProtocol[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ protocols: PreviewProtocol[] }>(
        "/api/judgment/demo",
        settings,
      );
      setProtocols(result.protocols);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header
        homeHref="/judgment/demo"
        leading={
          <Link
            className="button secondary small-button"
            href="/teacher?experiment=judgment"
          >
            教員用ページへ
          </Link>
        }
      >
        <span className="demo-header-tag">ひとりデモ</span>
      </Header>
      <main className="teacher-hub-main">
        <form className="judgment-create" onSubmit={start}>
          <h1>{JUDGMENT_NAME}</h1>
          <SettingsFields
            settings={settings}
            studies={studies}
            onChange={setSettings}
            disabled={busy}
          />
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary"
            disabled={busy || !settings.studyIds.length}
          >
            {busy ? "準備中…" : "デモを開始"}
          </button>
        </form>
        {protocols && (
          <JudgmentPreview
            demo
            protocols={protocols}
            onClose={() => setProtocols(null)}
          />
        )}
      </main>
    </>
  );
}
