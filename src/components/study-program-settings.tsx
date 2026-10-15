"use client";

import { useState } from "react";
import type { Command, RoomView } from "@/lib/types";
import type { Institution, StudyPeriods, StudyTiming } from "@/lib/study-types";
import {
  DEFAULT_STUDY_PERIODS,
  studyInstitutions,
  studyPeriodsError,
} from "@/lib/study-config";
import {
  studyTiming,
  studyTimingError,
  studyTimingForInstitutions,
} from "@/lib/study-timing";
import { StudyProgramFields } from "./study-program-fields";

export function StudyProgramEditor({
  view,
  command,
  disabled,
  onConfirmed,
  onDirty,
}: {
  view: RoomView;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
  onConfirmed?: () => void;
  onDirty?: () => void;
}) {
  const [draft, setDraft] = useState<{
    institutions: Institution[];
    periods: StudyPeriods;
    timing: StudyTiming;
    revision: number;
  } | null>(null);
  const institutions = draft?.institutions ?? studyInstitutions(view.config);
  const periods = draft?.periods ?? {
    ...DEFAULT_STUDY_PERIODS,
    ...view.config.studyPeriods,
  };
  const locked = view.phase !== "waiting" || view.round > 0;
  const timing = draft?.timing ?? studyTiming(view.config);
  const editable =
    !disabled && !locked && (Boolean(onConfirmed) || Boolean(draft));
  function update(change: Partial<NonNullable<typeof draft>>) {
    onDirty?.();
    setDraft({
      institutions: [...institutions],
      periods: { ...periods },
      timing: { ...timing },
      revision: view.study!.settingsRevision,
      ...draft,
      ...change,
    });
  }
  const stale =
    draft !== null && draft.revision !== view.study!.settingsRevision;
  const error = !institutions.length
    ? "実施する制度を1つ以上選択してください。"
    : studyPeriodsError(periods, institutions) ||
      (onConfirmed ? studyTimingError(timing, institutions) : "");
  return (
    <section
      className={onConfirmed ? "study-setup-editor" : "panel study-section"}
      aria-label="制度と期数の設定"
    >
      {!onConfirmed && (
        <div className="study-section-heading">
          <h2>制度と期数</h2>
          {!draft && !onConfirmed && (
            <button
              type="button"
              className="button secondary"
              disabled={disabled || locked}
              onClick={() =>
                setDraft({
                  institutions: [...institutions],
                  periods: { ...periods },
                  timing: { ...timing },
                  revision: view.study!.settingsRevision,
                })
              }
            >
              制度・期数を変更
            </button>
          )}
        </div>
      )}
      <StudyProgramFields
        institutions={institutions}
        periods={periods}
        timing={onConfirmed ? timing : undefined}
        onInstitutionsChange={(value) => update({ institutions: value })}
        onPeriodsChange={(value) => update({ periods: value })}
        onTimingChange={(value) => update({ timing: value })}
        disabled={!editable}
        marketSize={view.config.marketSize ?? 16}
        postedBatch={
          view.config.studyPostedMechanism === "batch-bids-v1" ||
          !studyInstitutions(view.config).includes("posted")
        }
      />
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {stale && (
        <p className="error-message" role="alert">
          設定が更新されました。キャンセルして最新の設定を開いてください。
        </p>
      )}
      {(draft || onConfirmed) && (
        <div className="study-actions">
          <button
            type="button"
            className="button primary"
            disabled={disabled || locked || stale || Boolean(error)}
            onClick={async () => {
              if (!draft) {
                onConfirmed?.();
                return;
              }
              if (
                await command({
                  type: "study-program",
                  institutions: draft.institutions,
                  periods: draft.periods,
                  ...(onConfirmed
                    ? {
                        timing: studyTimingForInstitutions(
                          draft.timing,
                          draft.institutions,
                        ),
                      }
                    : {}),
                  expectedRevision: draft.revision,
                })
              ) {
                setDraft(null);
                onConfirmed?.();
              }
            }}
          >
            {onConfirmed ? "確定して次へ" : "制度・期数を保存"}
          </button>
          {draft && (
            <button
              type="button"
              className="button secondary"
              disabled={disabled}
              onClick={() => setDraft(null)}
            >
              {stale ? "最新の設定に戻す" : "変更を取り消す"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
