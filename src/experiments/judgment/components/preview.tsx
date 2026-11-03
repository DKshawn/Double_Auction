"use client";
import { useEffect, useRef, useState } from "react";
import { teacherText } from "./teacher-language";
import { DemoModeBadge } from "@/components/demo-mode-badge";
import type { Language, PreviewProtocol } from "../types";
import {
  StudentApp,
  type AppHandle,
  type PreviewProgress,
} from "./student-app";
export function JudgmentPreview({
  protocols,
  onClose,
  demo = false,
  language = "ja",
}: {
  protocols: PreviewProtocol[];
  onClose: () => void;
  demo?: boolean;
  language?: Language;
}) {
  const t = (text: string) => teacherText(text, language);
  const dialog = useRef<HTMLDialogElement>(null),
    handle = useRef<AppHandle | null>(null);
  const [progress, setProgress] = useState<PreviewProgress>({
    index: 0,
    total: 0,
    status: "active",
  });
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="judgment-preview"
      aria-label={t(demo ? "DEMOモード" : "学生画面のプレビュー")}
      lang={language === "zh" ? "zh-CN" : language}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="judgment-preview-toolbar">
        {demo ? (
          <DemoModeBadge label={t("DEMOモード")} />
        ) : (
          <strong>{t("プレビュー")}</strong>
        )}
        <span>{t("回答は保存されません。制限時間は停止しています。")}</span>
        <div>
          <button
            className="button secondary"
            disabled={progress.index === 0}
            onClick={() => handle.current?.move(-1)}
          >
            {t("前のページ")}
          </button>
          <button
            className="button secondary"
            disabled={progress.index >= progress.total}
            onClick={() => handle.current?.move(1, true)}
          >
            {t("スキップ")}
          </button>
          <button className="button primary" onClick={onClose}>
            {t(demo ? "実験設定に戻る" : "閉じる")}
          </button>
        </div>
      </div>
      <StudentApp
        initialLanguage={language}
        protocols={protocols}
        handle={handle}
        onProgress={setProgress}
      />
    </dialog>
  );
}
