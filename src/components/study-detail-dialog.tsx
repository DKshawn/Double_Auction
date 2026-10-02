"use client";

import { useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Keep supplementary tables from growing the live trading screen. */
export function StudyDetailDialog({
  label,
  title = label,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        className="text-button study-detail-trigger"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        className="study-detail-dialog"
        aria-labelledby={titleId}
      >
        <div className="study-detail-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="button secondary"
            onClick={() => dialog.current?.close()}
          >
            <X size={16} /> 閉じる
          </button>
        </div>
        <div className="study-detail-content">{children}</div>
      </dialog>
    </>
  );
}
