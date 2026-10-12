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
import { StudyConditionPreview } from "./study-condition-preview";

export type StudyPresetPreview = {
  settings: StudySettings;
  generator?: StudyGeneratorConfig;
  revision: number;
};

/** The same preview and confirmation flow before and after room creation. */
export function StudyPresetPicker({
  existingPreset,
  units,
  revision = 0,
  initialGenerator,
  disabled,
  locked = false,
  actionLabel,
  onConfirm,
  onDraftChange,
  renderAssignments,
}: {
  existingPreset?: { label: string; settings: StudySettings };
  units: number;
  revision?: number;
  initialGenerator?: StudyGeneratorConfig;
  disabled: boolean;
  locked?: boolean;
  actionLabel: string;
  onConfirm: (preview: StudyPresetPreview) => boolean | Promise<boolean>;
  onDraftChange?: () => void;
  renderAssignments?: (preview: StudyPresetPreview) => ReactNode;
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
  const [preview, setPreview] = useState<StudyPresetPreview | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const stale = preview && preview.revision !== revision;
  const perSide = units / 2;
  const blocked = disabled || confirming;

  function changed() {
    setPreview(null);
    setError("");
    onDraftChange?.();
  }

  function generate() {
    onDraftChange?.();
    try {
      const generator: StudyGeneratorConfig | undefined =
        preset === "overlap"
          ? { kind: "overlap-staircase", parameters: { ...parameters }, seed }
          : undefined;
      if (!generator && !existingPreset)
        throw new Error(
          "既存プリセットを取得できません。画面を再読込してください。",
        );
      setPreview({
        settings: generator
          ? generatedStudySettings(generator, units)
          : structuredClone(existingPreset!.settings),
        ...(generator ? { generator } : {}),
        revision,
      });
      setError("");
    } catch (e) {
      setPreview(null);
      setError(
        e instanceof Error ? e.message : "パラメータを確認してください。",
      );
    }
  }

  return (
    <div className="study-preset-picker">
      <label className="field">
        供需プリセット
        <select
          value={preset}
          disabled={blocked}
          onChange={(e) => {
            setPreset(e.target.value);
            changed();
          }}
        >
          <option value="existing">
            {existingPreset?.label ?? "既存 PPT プリセット"}
          </option>
          <option value="overlap">横向き重なり階段（候補）</option>
        </select>
      </label>
      {preset === "overlap" && (
        <>
          <p className="field-help">
            買い手{perSide}人・売り手{perSide}人、各2単位、片側{units}単位。
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
                  disabled={blocked}
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
                disabled={blocked}
                onChange={(e) => {
                  setSeed(e.target.value === "" ? NaN : Number(e.target.value));
                  changed();
                }}
              />
            </label>
          </div>
          <p className="field-help">
            K・Lは1以上の整数、K＋L≤{units}
            、d&gt;0。すべての生成値が1〜999円の整数になる条件を指定してください。
          </p>
        </>
      )}
      <button
        type="button"
        className="button secondary"
        onClick={generate}
        disabled={blocked}
      >
        生成してプレビュー
      </button>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className="study-generated-preview">
          <h3>
            {preview.generator
              ? "横向き重なり階段のプレビュー"
              : `${existingPreset?.label}のプレビュー`}
          </h3>
          <StudyConditionPreview settings={preview.settings} />
          {preview.generator && (
            <p className="field-help">
              第i単位と第i＋{perSide}
              単位を同じ役割に配分します。同じ人数・入室順・シードで割当を再現し、
              全期・全制度で固定します。各市場は同じ役割別の条件を使います。
            </p>
          )}
          {renderAssignments?.(preview)}
          {stale && (
            <p className="error-message" role="alert">
              条件が更新されました。生成してプレビューし直してください。
            </p>
          )}
          <button
            type="button"
            className="button primary"
            disabled={blocked || locked || Boolean(stale)}
            onClick={async () => {
              setConfirming(true);
              try {
                if (await onConfirm(preview)) setPreview(null);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "条件を保存できませんでした。",
                );
              } finally {
                setConfirming(false);
              }
            }}
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
