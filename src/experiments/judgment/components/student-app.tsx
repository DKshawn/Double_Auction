"use client";
import { useEffect, useRef } from "react";
import type { Language, PreviewProtocol } from "../types";
export type PreviewProgress = { index: number; total: number; status: string };
export type AppHandle = {
  move: (direction: number, skip?: boolean) => void;
  dispose: () => void;
};
type Mount = (
  host: HTMLElement,
  options: {
    code?: string;
    isPreview?: boolean;
    initialLanguage?: Language;
    protocols?: PreviewProtocol[];
    onPreviewState?: (state: PreviewProgress) => void;
  },
) => AppHandle;
export function StudentApp({
  code = "",
  protocols,
  onProgress,
  handle,
  initialLanguage = "ja",
}: {
  code?: string;
  protocols?: PreviewProtocol[];
  onProgress?: (state: PreviewProgress) => void;
  handle?: React.RefObject<AppHandle | null>;
  initialLanguage?: Language;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false,
      app: AppHandle | undefined;
    void import("../vendor/public/app.js")
      .then((module) => {
        if (cancelled || !host.current) return;
        app = (module.mountJudgment as Mount)(host.current, {
          code,
          isPreview: Boolean(protocols),
          protocols,
          initialLanguage,
          onPreviewState: onProgress,
        });
        if (handle) handle.current = app;
      })
      .catch(() => {
        if (!cancelled && host.current)
          host.current.textContent =
            "読み込めませんでした。再読み込みしてください。";
      });
    return () => {
      cancelled = true;
      app?.dispose();
      if (handle) handle.current = null;
    };
  }, [code, protocols, onProgress, handle, initialLanguage]);
  return (
    <div ref={host} className="judgment-app" lang="ja">
      <p className="loading" role="status">
        読み込み中…
      </p>
    </div>
  );
}
