"use client";
import { useEffect, useRef, useState } from "react";
import type { PreviewProtocol } from "../types";
import {
  StudentApp,
  type AppHandle,
  type PreviewProgress,
} from "./student-app";
export function JudgmentPreview({
  protocols,
  onClose,
}: {
  protocols: PreviewProtocol[];
  onClose: () => void;
}) {
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
      aria-label="学生画面のプレビュー"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="judgment-preview-toolbar">
        <strong>プレビュー</strong>
        <span>回答は保存されません。制限時間は停止しています。</span>
        <div>
          <button
            className="button secondary"
            disabled={progress.index === 0}
            onClick={() => handle.current?.move(-1)}
          >
            前のページ
          </button>
          <button
            className="button secondary"
            disabled={progress.index >= progress.total}
            onClick={() => handle.current?.move(1, true)}
          >
            スキップ
          </button>
          <button className="button primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
      <StudentApp
        protocols={protocols}
        handle={handle}
        onProgress={setProgress}
      />
    </dialog>
  );
}
