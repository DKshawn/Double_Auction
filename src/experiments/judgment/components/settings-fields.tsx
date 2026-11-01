"use client";
import type { Settings, Study } from "../types";
export function SettingsFields({
  settings,
  studies,
  onChange,
  disabled = false,
}: {
  settings: Settings;
  studies: Study[];
  onChange: (value: Settings) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="judgment-settings" disabled={disabled}>
      <legend>実施する課題</legend>
      <div className="judgment-section-heading">
        <div>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onChange({ ...settings, studyIds: studies.map((s) => s.id) })
            }
          >
            すべて選択
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => onChange({ ...settings, studyIds: [] })}
          >
            選択を解除
          </button>
        </div>
      </div>
      <div className="judgment-study-grid">
        {studies.map((study) => (
          <label
            key={study.id}
            className={settings.studyIds.includes(study.id) ? "selected" : ""}
          >
            <input
              type="checkbox"
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
            <span>{study.names.ja}</span>
          </label>
        ))}
      </div>
      <div className="judgment-randomization">
        <label>
          <input
            type="checkbox"
            checked={settings.randomizeExperiments}
            onChange={(e) =>
              onChange({ ...settings, randomizeExperiments: e.target.checked })
            }
          />
          課題の順番を学生ごとにランダム化
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.randomizeChoices}
            onChange={(e) =>
              onChange({ ...settings, randomizeChoices: e.target.checked })
            }
          />
          選択肢の順番をランダム化
        </label>
      </div>
    </fieldset>
  );
}
