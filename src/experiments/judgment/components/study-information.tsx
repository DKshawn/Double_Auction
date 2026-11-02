"use client";

import { useId, useRef } from "react";
import type { Language, Study } from "../types";
import { teacherText } from "./teacher-language";

export function StudyInformation({
  study,
  language = "ja",
}: {
  study: Study;
  language?: Language;
}) {
  const t = (text: string) => teacherText(text, language);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;

  return (
    <>
      <button
        type="button"
        className="button secondary judgment-study-info"
        aria-label={teacherText("{name}の詳細", language, {
          name: study.names[language],
        })}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        title={t("課題の詳細")}
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
          <h2 id={titleId}>{study.names[language]}</h2>
          <button
            type="button"
            className="button secondary small-button"
            onClick={() => dialog.current?.close()}
          >
            {t("閉じる")}
          </button>
        </div>
        <div className="judgment-study-dialog-content">
          <p className="judgment-study-duration">
            {teacherText("所要時間の目安：約{minutes}分", language, {
              minutes: study.minutes,
            })}
          </p>
          <p>{study.description[language]}</p>
          {study.conditions[language].length > 0 && (
            <section className="judgment-study-conditions">
              <h3>{t("実施条件")}</h3>
              {study.conditions[language].map((condition) => (
                <p key={condition}>{condition}</p>
              ))}
            </section>
          )}
        </div>
      </dialog>
    </>
  );
}
