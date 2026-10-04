"use client";

import { useState } from "react";
import {
  DEFAULT_STUDY_TIMING,
  MAX_STAGE_SECONDS,
  STUDY_TIMING_FIELDS,
  studyTiming,
  studyTimingError,
} from "@/lib/study-timing";
import type { StudyTiming } from "@/lib/study-types";
import type { Command, RoomView } from "@/lib/types";

export function StudyTimingFields({
  timing,
  onChange,
  disabled = false,
}: {
  timing: StudyTiming;
  onChange: (timing: StudyTiming) => void;
  disabled?: boolean;
}) {
  const error = studyTimingError(timing);
  return (
    <>
      <div className="form-grid">
        {STUDY_TIMING_FIELDS.map(({ key, label }) => (
          <label className="field" key={key}>
            {label}
            <input
              type="number"
              name={`studyTiming.${key}`}
              min={1}
              max={MAX_STAGE_SECONDS}
              step={1}
              required
              disabled={disabled}
              value={timing[key] || ""}
              onChange={(e) =>
                onChange({ ...timing, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <p className={error ? "error-message" : "field-help"} aria-live="polite">
        {error ||
          "1〜3600秒の整数。Call Marketは1期に4回受付します。購入完了・辞退などで予定より早く次へ進む場合があります。"}
      </p>
    </>
  );
}

export function StudyTimingEditor({
  view,
  command,
  disabled,
}: {
  view: RoomView;
  command: (c: Command) => Promise<boolean>;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<StudyTiming | null>(null);
  const [revision, setRevision] = useState(0);
  const timing = draft ?? studyTiming(view.config);
  const locked = view.phase !== "waiting" || view.round > 0;
  const stale = draft !== null && revision !== view.study!.settingsRevision;
  const [saved, setSaved] = useState(false);
  return (
    <section className="panel study-section" aria-label="実験時間の設定">
      <div className="study-section-heading">
        <div>
          <h2>実験時間の設定</h2>
          <p className="muted">
            全市場・各制度の5期で共通です。実験開始前のみ変更できます。
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            className="button secondary"
            disabled={disabled || locked}
            onClick={() => {
              setDraft({ ...timing });
              setRevision(view.study!.settingsRevision);
              setSaved(false);
            }}
          >
            時間を変更
          </button>
        )}
      </div>
      <StudyTimingFields
        timing={timing}
        onChange={setDraft}
        disabled={disabled || locked || !draft}
      />
      {stale && (
        <p className="error-message">
          別の操作で設定が更新されました。キャンセルして最新の設定を開いてください。
        </p>
      )}
      {locked && (
        <p className="field-help">実験開始後は時間を変更できません。</p>
      )}
      {saved && (
        <p className="success-message" role="status">
          時間設定を保存しました。
        </p>
      )}
      {draft && (
        <div className="study-actions">
          <button
            type="button"
            className="button primary"
            disabled={
              disabled || locked || stale || Boolean(studyTimingError(draft))
            }
            onClick={async () => {
              if (
                await command({
                  type: "study-timing",
                  timing: draft,
                  expectedRevision: revision,
                })
              ) {
                setDraft(null);
                setSaved(true);
              }
            }}
          >
            時間設定を保存
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={disabled || locked}
            onClick={() => setDraft({ ...DEFAULT_STUDY_TIMING })}
          >
            標準時間に戻す
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={() => setDraft(null)}
          >
            キャンセル
          </button>
        </div>
      )}
    </section>
  );
}
