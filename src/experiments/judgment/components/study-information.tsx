"use client";

import { useId, useRef } from "react";
import type { Study } from "../types";

export function StudyInformation({ study }: { study: Study }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;

  return (
    <>
      <button
        type="button"
        className="button secondary judgment-study-info"
        aria-label={`${study.names.ja}の詳細`}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        title="課題の詳細"
        onClick={() => dialog.current?.showModal()}
      >
        <span aria-hidden="true">i</span>
      </button>
      <dialog
        ref={dialog}
        id={dialogId}
        className="judgment-study-dialog"
        aria-labelledby={titleId}
      >
        <div className="judgment-study-dialog-heading">
          <h2 id={titleId}>{study.names.ja}</h2>
          <button
            type="button"
            className="button secondary small-button"
            onClick={() => dialog.current?.close()}
          >
            閉じる
          </button>
        </div>
        <div className="judgment-study-dialog-content">
          <p className="judgment-study-duration">
            所要時間の目安：約{study.minutes}分
          </p>
          <p>{study.description.ja}</p>
          {study.conditions.ja.length > 0 && (
            <section className="judgment-study-conditions">
              <h3>実施条件</h3>
              {study.conditions.ja.map((condition) => (
                <p key={condition}>{condition}</p>
              ))}
            </section>
          )}
        </div>
      </dialog>
    </>
  );
}
