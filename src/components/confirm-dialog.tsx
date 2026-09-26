"use client";
import { useEffect, useRef, useState } from "react";

export function ConfirmDialog({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-description">{message}</p>
      <div className="dialog-actions">
        <button
          className="button secondary"
          disabled={pending}
          onClick={onCancel}
        >
          戻る
        </button>
        <button
          className="button primary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await onConfirm();
          }}
        >
          {pending ? "処理中…" : "終了する"}
        </button>
      </div>
    </dialog>
  );
}
