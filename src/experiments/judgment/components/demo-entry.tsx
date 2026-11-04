"use client";
import {
  TeacherLanguage,
  useTeacherLanguage,
  teacherText,
} from "./teacher-language";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/shell";
import { api, errorMessage } from "@/lib/client";
import { JUDGMENT_NAME } from "../constants";
import type { PreviewProtocol, Settings, Study } from "../types";
import { JudgmentPreview } from "./preview";
import { SettingsFields } from "./settings-fields";
import { DemoSelectionLink } from "@/components/demo-selection-link";

export function JudgmentDemoEntry({ studies }: { studies: Study[] }) {
  const [language, setLanguage] = useTeacherLanguage();
  const t = (text: string, values: Record<string, string | number> = {}) =>
    teacherText(text, language, values);
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
        demoLabel={t("DEMOモード")}
        demoExitLabel={t("DEMOモードを終了")}
        leading={
          <>
            <DemoSelectionLink />
            <Link
              className="button secondary small-button"
              href="/teacher?experiment=judgment"
            >
              教員用ページへ
            </Link>
          </>
        }
      ></Header>
      <main
        className="judgment-entry-main"
        lang={language === "zh" ? "zh-CN" : language}
      >
        <form className="judgment-create" onSubmit={start}>
          <div className="judgment-section-heading">
            <h1>{JUDGMENT_NAME}</h1>
            <TeacherLanguage language={language} onChange={setLanguage} />
          </div>
          <SettingsFields
            settings={settings}
            studies={studies}
            onChange={setSettings}
            disabled={busy}
            language={language}
          >
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary"
              disabled={busy || !settings.studyIds.length}
            >
              {t(busy ? "準備中…" : "デモを開始")}
            </button>
          </SettingsFields>
        </form>
        {protocols && (
          <JudgmentPreview
            demo
            language={language}
            protocols={protocols}
            onClose={() => setProtocols(null)}
          />
        )}
      </main>
    </>
  );
}
