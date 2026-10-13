"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Keep supplementary tables from growing the live trading screen. */
export function StudyDetailDialog({
  label,
  title = label,
  children,
  triggerClassName = "text-button study-detail-trigger",
  open,
  onClose,
}: {
  label: string;
  title?: string;
  children: ReactNode;
  triggerClassName?: string;
  open?: boolean;
  onClose?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open === undefined) return;
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      {open === undefined && (
        <button
          type="button"
          className={triggerClassName}
          aria-haspopup="dialog"
          onClick={() => dialog.current?.showModal()}
        >
          {label}
        </button>
      )}
      <dialog
        ref={dialog}
        className="study-detail-dialog"
        aria-labelledby={titleId}
        onClose={onClose}
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
