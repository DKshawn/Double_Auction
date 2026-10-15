"use client";

import { useState } from "react";
import { equilibrium } from "@/lib/equilibrium";
import type { Command, RoomView } from "@/lib/types";
import type { StudySettings } from "@/lib/study-types";
import { studyInstitutions } from "@/lib/study-config";
import { studyCommission, studyCommissionError } from "@/lib/study-commission";
import { StudyPresetGenerator } from "./study-preset-generator";
import { StudyCommissionField } from "./study-commission-settings";
import { StudyConditionPreview } from "./study-condition-preview";
import { isValidPrice } from "@/lib/price";

export function StudySettingsEditor({
  view,
  command,
  disabled,
  onConfirmed,
  onDirty,
  confirmDisabled = false,
}: {
  view: RoomView;
  command: (c: Command) => Promise<boolean>;
  disabled: boolean;
  onConfirmed?: () => void;
  onDirty?: () => void;
  confirmDisabled?: boolean;
}) {
  const teacher = view.study!.teacher!;
  const institutions = studyInstitutions(view.config);
  const [draft, setDraft] = useState<StudySettings | null>(null);
  const [commissionDraft, setCommissionDraft] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const settings = draft ?? teacher.settings;
  const commission = commissionDraft ?? studyCommission(view.config);
  const valid =
    [...settings.values, ...settings.costs].every((pair) =>
      pair.every(isValidPrice),
    ) &&
    settings.values.every((p) => p.every((v, i) => i === 0 || v <= p[i - 1])) &&
    settings.costs.every((p) => p.every((v, i) => i === 0 || v >= p[i - 1]));
  const eq = valid
    ? equilibrium(settings.values.flat(), settings.costs.flat())
    : null;
  const stale = draft && revision !== view.study!.settingsRevision;
  const commissionError = valid
    ? studyCommissionError(
        commission,
        settings,
        institutions.some((i) => i !== "cda")
          ? teacher.otherSettings
          : undefined,
      )
    : "";
  return (
    <section
      className={onConfirmed ? "study-setup-editor" : "panel study-section"}
      aria-label="供需条件の設定"
    >
      <div className="study-section-heading">
        <div>
          <h2>供需条件の設定</h2>
          <p className="muted">
            全市場・全期で条件を固定します。開始後は変更できません。
            {teacher.otherSettings &&
              "現在はCDAの条件を表示しています。Call Market・Posted Offerは従来の2単位の条件を保ちます。"}
          </p>
        </div>
        {!draft && (
          <button
            className="button secondary"
            disabled={disabled || view.round > 0 || view.phase !== "waiting"}
            onClick={() => {
              onDirty?.();
              setDraft(structuredClone(teacher.settings));
              setCommissionDraft(studyCommission(view.config));
              setRevision(view.study!.settingsRevision);
            }}
          >
            供需条件・Commissionを変更
          </button>
        )}
      </div>
      <StudyCommissionField
        amount={commission}
        settings={valid ? settings : teacher.settings}
        otherSettings={
          institutions.some((i) => i !== "cda")
            ? teacher.otherSettings
            : undefined
        }
        onChange={(value) => {
          onDirty?.();
          if (!draft) {
            setDraft(structuredClone(teacher.settings));
            setRevision(view.study!.settingsRevision);
          }
          setCommissionDraft(value);
        }}
        disabled={
          disabled ||
          (!draft && !onConfirmed) ||
          view.round > 0 ||
          view.phase !== "waiting"
        }
      />
      <StudyPresetGenerator
        key={view.study!.settingsRevision}
        view={view}
        command={command}
        disabled={disabled}
        onApplied={() => {
          onDirty?.();
          setDraft(null);
          setCommissionDraft(null);
        }}
      />
      {eq &&
        (onConfirmed ? (
          <details className="study-setup-condition-preview">
            <summary>供需図・理論均衡を確認</summary>
            <StudyConditionPreview
              settings={settings}
              commission={commission}
            />
          </details>
        ) : (
          <StudyConditionPreview settings={settings} commission={commission} />
        ))}
      {teacher.otherSettings && institutions.some((i) => i !== "cda") && (
        <details className="study-other-conditions">
          <summary>Call Market・Posted Offerの条件（各自2単位）</summary>
          <StudyConditionPreview
            settings={teacher.otherSettings}
            commission={commission}
          />
        </details>
      )}
      {(draft || onConfirmed) && (
        <>
          {!valid && (
            <p className="error-message">値と単位の順序を確認してください。</p>
          )}
          {stale && (
            <p className="error-message">
              別の操作で設定が更新されました。一度キャンセルして、最新の設定を開いてください。
            </p>
          )}
          <div className="study-actions">
            <button
              className="button primary"
              disabled={
                disabled ||
                confirmDisabled ||
                !valid ||
                Boolean(commissionError) ||
                Boolean(stale) ||
                view.phase !== "waiting" ||
                view.round > 0
              }
              onClick={async () => {
                if (!draft) {
                  onConfirmed?.();
                  return;
                }
                if (
                  await command({
                    type: "study-settings",
                    settings: draft,
                    commission,
                    expectedRevision: revision,
                  })
                ) {
                  setDraft(null);
                  setCommissionDraft(null);
                  onConfirmed?.();
                }
              }}
            >
              {onConfirmed ? "確定して次へ" : "この条件を保存"}
            </button>
            {draft && (
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => {
                  setDraft(null);
                  setCommissionDraft(null);
                }}
              >
                キャンセル
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
