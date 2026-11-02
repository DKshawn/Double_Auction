"use client";
import { useId, type ReactNode } from "react";
import type { Language, Settings, Study } from "../types";
import { StudyInformation } from "./study-information";
import { teacherText } from "./teacher-language";
export function SettingsFields({
  settings,
  studies,
  onChange,
  disabled = false,
  language = "ja",
  children,
}: {
  settings: Settings;
  studies: Study[];
  onChange: (value: Settings) => void;
  disabled?: boolean;
  language?: Language;
  children?: ReactNode;
}) {
  const summaryId = useId();
  const t = (text: string) => teacherText(text, language);
  const selected = settings.studyIds.flatMap(
    (id) => studies.find((s) => s.id === id) ?? [],
  );
  return (
    <div className="judgment-workspace">
      <fieldset className="judgment-settings">
        <legend>{t("実施する課題")}</legend>
        <div className="judgment-section-heading">
          <div>
            <button
              type="button"
              className="button secondary small-button"
              disabled={disabled}
              onClick={() =>
                onChange({ ...settings, studyIds: studies.map((s) => s.id) })
              }
            >
              {t("すべて選択")}
            </button>
            <button
              type="button"
              className="button secondary small-button"
              disabled={disabled}
              onClick={() => onChange({ ...settings, studyIds: [] })}
            >
              {t("選択を解除")}
            </button>
          </div>
        </div>
        <div className="judgment-study-grid">
          {studies.map((study) => (
            <div
              key={study.id}
              className={`judgment-study-option${settings.studyIds.includes(study.id) ? " selected" : ""}`}
            >
              <label>
                <span className="judgment-study-title">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    aria-label={study.names[language]}
                    aria-describedby={`${summaryId}-${study.id}-description`}
                    checked={settings.studyIds.includes(study.id)}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        studyIds: e.target.checked
                          ? [...settings.studyIds, study.id]
                          : settings.studyIds.filter((id) => id !== study.id),
                      })
                    }
                  />
                  <strong>{study.names[language]}</strong>
                </span>
                <span
                  className="judgment-study-description"
                  id={`${summaryId}-${study.id}-description`}
                >
                  {study.description[language]}
                </span>
              </label>
              <StudyInformation study={study} language={language} />
            </div>
          ))}
        </div>
      </fieldset>
      <aside className="judgment-control-panel" aria-labelledby={summaryId}>
        <strong id={summaryId} role="status" aria-atomic="true">
          {teacherText("{count}課題を選択", language, {
            count: selected.length,
          })}
        </strong>
        <ul className="judgment-selected-studies">
          {selected.map((study) => (
            <li key={study.id}>{study.names[language]}</li>
          ))}
        </ul>
        <div className="judgment-randomization">
          <label>
            <input
              type="checkbox"
              disabled={disabled}
              checked={settings.randomizeExperiments}
              onChange={(e) =>
                onChange({
                  ...settings,
                  randomizeExperiments: e.target.checked,
                })
              }
            />
            {t("課題の順番を学生ごとにランダム化")}
          </label>
          <label>
            <input
              type="checkbox"
              disabled={disabled}
              checked={settings.randomizeChoices}
              onChange={(e) =>
                onChange({ ...settings, randomizeChoices: e.target.checked })
              }
            />
            {t("選択肢の順番をランダム化")}
          </label>
        </div>
        {children}
      </aside>
    </div>
  );
}
