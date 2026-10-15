"use client";

import { useState, type ReactNode } from "react";
import {
  DEFAULT_ASSIGNMENT_SEED,
  DEFAULT_STAIRCASE_PARAMETERS,
  generatedStudySettings,
} from "@/lib/study-generator";
import type {
  StaircaseParameters,
  StudyGeneratorConfig,
  StudySettings,
} from "@/lib/study-types";
import {
  StudyConditionPreview,
  StudyUnitValues,
} from "./study-condition-preview";
import { StudyCommissionField } from "./study-commission-settings";
import { studyCommissionError } from "@/lib/study-commission";
import { MAX_PRICE } from "@/lib/price";

export type StudyPresetPreview = {
  settings: StudySettings;
  otherSettings?: StudySettings;
  generator?: StudyGeneratorConfig;
  revision: number;
};

/** The same preview and confirmation flow before and after room creation. */
export function StudyPresetPicker({
  existingPreset,
  units,
  unitsPerParticipant = 2,
  otherSettings,
  otherUnits,
  revision = 0,
  initialGenerator,
  disabled,
  locked = false,
  actionLabel,
  onConfirm,
  onDraftChange,
  renderAssignments,
  commission,
  onCommissionChange,
  settingsPanel,
  renderUnitFields,
  validationError = "",
  confirmDisabled = false,
}: {
  existingPreset?: { label: string; settings: StudySettings };
  units: number;
  unitsPerParticipant?: number;
  otherSettings?: StudySettings;
  // Creation derives the other institutions' two-unit schedule from the same preset.
  // After creation their saved conditions are passed unchanged via otherSettings.
  otherUnits?: number;
  revision?: number;
  initialGenerator?: StudyGeneratorConfig;
  disabled: boolean;
  locked?: boolean;
  actionLabel: string;
  onConfirm: (
    preview: StudyPresetPreview,
    commission: number,
  ) => boolean | Promise<boolean>;
  onDraftChange?: () => void;
  renderAssignments?: (preview: StudyPresetPreview) => ReactNode;
  commission: number;
  onCommissionChange: (amount: number) => void;
  renderUnitFields?: (disabled: boolean) => ReactNode;
  validationError?: string;
  confirmDisabled?: boolean;
  settingsPanel?: {
    heading: ReactNode;
    labelledBy: string;
  };
}) {
  const [preset, setPreset] = useState(
    initialGenerator ? "overlap" : "existing",
  );
  const [parameters, setParameters] = useState<StaircaseParameters>(() => ({
    ...(initialGenerator?.parameters ?? DEFAULT_STAIRCASE_PARAMETERS),
  }));
  const [seed, setSeed] = useState(
    initialGenerator?.seed ?? DEFAULT_ASSIGNMENT_SEED,
  );
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const custom = preset === "overlap";
  const perSide = units / unitsPerParticipant;
  const blocked = disabled || confirming;
  const fieldsBlocked = blocked;
  const cdaOnly = unitsPerParticipant !== 2 || Boolean(otherSettings);
  function otherConditions(generator?: StudyGeneratorConfig) {
    if (!otherUnits || !generator) return otherSettings;
    try {
      return generatedStudySettings(generator, otherUnits);
    } catch (e) {
      throw new Error(
        `Call Market・Posted Offer（2単位）の条件：${e instanceof Error ? e.message : "パラメータを確認してください。"}`,
      );
    }
  }
  let candidate: StudySettings | undefined;
  let candidateOther: StudySettings | undefined = otherSettings;
  let generationError = "";
  let otherError = "";
  const generator: StudyGeneratorConfig | undefined = custom
    ? { kind: "overlap-staircase", parameters: { ...parameters }, seed }
    : undefined;
  try {
    if (validationError) throw new Error(validationError);
    if (!generator && !existingPreset)
      throw new Error(
        "Defaultの供需条件を取得できません。画面を再読込してください。",
      );
    candidate = generator
      ? generatedStudySettings(generator, units, unitsPerParticipant)
      : existingPreset!.settings;
  } catch (e) {
    generationError =
      e instanceof Error ? e.message : "パラメータを確認してください。";
  }
  try {
    candidateOther = otherConditions(generator);
  } catch (e) {
    otherError =
      e instanceof Error ? e.message : "他制度の供需条件を確認してください。";
  }
  const commissionError = studyCommissionError(
    commission,
    candidate,
    candidateOther,
  );
  // A preview is derived from the current inputs; saving still requires confirmation.
  const preview: StudyPresetPreview | null =
    candidate && !generationError && !otherError
      ? { settings: candidate, generator, revision }
      : null;
  const previewError = generationError || otherError || error;

  function changed() {
    setError("");
    onDraftChange?.();
  }

  const content = (
    <>
      <label className="field">
        供需プリセット
        <select
          value={preset}
          disabled={fieldsBlocked}
          onChange={(e) => {
            if (preset === "existing" && e.target.value === "overlap") {
              setParameters({ ...DEFAULT_STAIRCASE_PARAMETERS });
              setSeed(DEFAULT_ASSIGNMENT_SEED);
            }
            setPreset(e.target.value);
            changed();
          }}
        >
          <option value="existing">{existingPreset?.label ?? "Default"}</option>
          <option value="overlap">カスタム</option>
        </select>
      </label>
      {renderUnitFields?.(fieldsBlocked)}
      <StudyCommissionField
        amount={commission}
        settings={candidate}
        otherSettings={candidateOther}
        disabled={fieldsBlocked || locked}
        onChange={(amount) => {
          onCommissionChange(amount);
          changed();
        }}
      />
      {custom && !validationError && (
        <>
          <p className="field-help">
            {cdaOnly && "CDA："}買い手{perSide}人・売り手{perSide}人、各
            {unitsPerParticipant}単位、片側{units}単位。
            {cdaOnly && "Call Market・Posted Offerは各自2単位です。"}
            既定のp=80・K=8・L=4・d=4は検討用の候補です。
          </p>
          <div className="study-generator-fields">
            {(
              [
                ["p", "均衡価格 p（円）"],
                ["K", "正の余剰の単位数 K"],
                ["L", "横向き重なりの長さ L"],
                ["d", "階段の価格差 d（円）"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type="number"
                  value={Number.isNaN(parameters[key]) ? "" : parameters[key]}
                  min={key === "d" ? undefined : 1}
                  step={key === "d" ? "any" : 1}
                  disabled={fieldsBlocked}
                  onChange={(e) => {
                    setParameters({
                      ...parameters,
                      [key]:
                        e.target.value === "" ? NaN : Number(e.target.value),
                    });
                    changed();
                  }}
                />
              </label>
            ))}
            <label className="field">
              割当シード
              <input
                type="number"
                min={0}
                max={4294967295}
                step={1}
                value={Number.isNaN(seed) ? "" : seed}
                disabled={fieldsBlocked}
                onChange={(e) => {
                  setSeed(e.target.value === "" ? NaN : Number(e.target.value));
                  changed();
                }}
              />
            </label>
          </div>
          <p className="field-help">
            K・Lは1以上の整数、K＋L≤{units}
            、d&gt;0。すべての生成値が1〜{MAX_PRICE}
            円の整数になる条件を指定してください。
          </p>
        </>
      )}
      {previewError && (
        <p className="error-message study-generator-error" role="alert">
          {previewError}
        </p>
      )}
      {custom && preview && (
        <div className="study-generated-preview">
          <h3>
            {cdaOnly && "CDA："}
            {preview.generator
              ? "カスタムのプレビュー"
              : `${existingPreset?.label}のプレビュー`}
          </h3>
          <StudyConditionPreview
            settings={preview.settings}
            commission={commission}
            showUnitValues={!settingsPanel}
          />
          {preview.generator && (
            <p className="field-help">
              第i単位から{perSide}単位間隔で{unitsPerParticipant}
              単位を同じ役割に配分します。同じ人数・入室順・シードで割当を再現し、
              {cdaOnly
                ? "CDAの全期で固定します。"
                : "全期・全制度で固定します。"}
              各市場は同じ役割別の条件を使います。
            </p>
          )}
          {renderAssignments?.(preview)}
          {candidateOther && (
            <details className="study-other-conditions">
              <summary>Call Market・Posted Offerの条件（各自2単位）</summary>
              <StudyConditionPreview
                settings={candidateOther}
                commission={commission}
              />
            </details>
          )}
        </div>
      )}
      <div className="study-actions">
        <button
          type="button"
          className="button primary"
          disabled={
            blocked ||
            locked ||
            confirmDisabled ||
            !preview ||
            Boolean(commissionError)
          }
          onClick={async () => {
            if (!preview) return;
            setConfirming(true);
            try {
              if (
                await onConfirm(
                  { ...preview, otherSettings: candidateOther },
                  commission,
                )
              ) {
                setError("");
              }
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "条件を保存できませんでした。",
              );
            } finally {
              setConfirming(false);
            }
          }}
        >
          {actionLabel}
        </button>
      </div>
    </>
  );
  return settingsPanel ? (
    <div
      className={`study-preset-picker${custom ? " study-preset-with-units" : ""}`}
    >
      <section
        className="panel teacher-condition-settings study-preset-settings"
        aria-labelledby={settingsPanel.labelledBy}
      >
        {settingsPanel.heading}
        {content}
      </section>
      {custom && (
        <section
          className="panel teacher-units-panel"
          aria-label="全単位の数値"
        >
          {preview ? (
            <StudyUnitValues settings={preview.settings} fixedHeading />
          ) : (
            <>
              <h2>全単位の数値</h2>
              <p className="field-help">有効な供需条件を設定してください。</p>
            </>
          )}
        </section>
      )}
    </div>
  ) : (
    <div className="study-preset-picker">{content}</div>
  );
}
