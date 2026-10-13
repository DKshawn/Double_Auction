"use client";

import { useId } from "react";
import {
  MAX_STUDY_COMMISSION,
  studyCommissionLimit,
  studyCommissionError,
} from "@/lib/study-commission";
import type { StudySettings } from "@/lib/study-types";

export function StudyCommissionField({
  amount,
  onChange,
  settings,
  disabled = false,
}: {
  amount: number;
  onChange: (amount: number) => void;
  settings?: StudySettings;
  disabled?: boolean;
}) {
  const id = useId();
  const error = studyCommissionError(amount, settings);
  const limit = settings ? studyCommissionLimit(settings) : null;
  const maximum = limit?.maximum ?? MAX_STUDY_COMMISSION;
  return (
    <div className="field study-commission-field">
      <label htmlFor={id}>Commission（円／1単位・1人）</label>
      <input
        id={id}
        type="number"
        name="studyCommission"
        min={0}
        max={maximum}
        step={1}
        required
        disabled={disabled}
        aria-describedby={`${id}-help`}
        aria-invalid={Boolean(error)}
        value={Number.isFinite(amount) ? amount : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
      <p
        id={`${id}-help`}
        className={error ? "error-message" : "field-help"}
        aria-live="polite"
      >
        {error ||
          `成立1単位につき買い手・売り手に各${Number.isFinite(amount) ? amount : "—"}円。未約定は0円、0円で無効。`}
      </p>
      <p className="field-help study-commission-bound">
        入力範囲：0〜{maximum}円（整数）。
        {limit?.gap !== null && limit?.gap !== undefined
          ? `第${limit.firstNegativeUnit}単位以降の負の余剰を維持するため、2 × Commission < ${limit.gap}円。`
          : settings
            ? "現在の供需条件には負の余剰の単位がありません。"
            : "供需条件を生成すると、その条件に対応する上限を表示します。"}
      </p>
    </div>
  );
}
