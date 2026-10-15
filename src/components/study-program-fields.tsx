"use client";

import {
  DEFAULT_STUDY_INSTITUTIONS,
  MAX_INSTITUTION_PERIODS,
} from "@/lib/study-config";
import { INSTITUTIONS } from "@/lib/study-rules";
import { MAX_STAGE_SECONDS, STUDY_TIMING_FIELDS } from "@/lib/study-timing";
import type { Institution, StudyPeriods, StudyTiming } from "@/lib/study-types";

/** Keep every institution's controls together in both creation and room setup. */
export function StudyProgramFields({
  institutions,
  periods,
  timing,
  onInstitutionsChange,
  onPeriodsChange,
  onTimingChange,
  disabled,
  marketSize = 16,
  postedBatch = true,
}: {
  institutions: readonly Institution[];
  periods: StudyPeriods;
  timing?: StudyTiming;
  onInstitutionsChange: (value: Institution[]) => void;
  onPeriodsChange: (value: StudyPeriods) => void;
  onTimingChange?: (value: StudyTiming) => void;
  disabled: boolean;
  marketSize?: number;
  postedBatch?: boolean;
}) {
  const timingLabels = {
    cdaSeconds: "1期の取引（秒）",
    callSeconds: "1回の受付（秒）",
    offerSeconds: "価格提示（秒）",
    buyerSeconds: "1人の購入（秒）",
    purchaseSeconds: "共通取引（秒）",
  };
  return (
    <div className="study-program-columns">
      {DEFAULT_STUDY_INSTITUTIONS.map((institution) => {
        const selected = institutions.includes(institution);
        return (
          <fieldset className="study-program-column" key={institution}>
            <legend>
              <label className="study-institution-option">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={(event) =>
                    onInstitutionsChange(
                      DEFAULT_STUDY_INSTITUTIONS.filter((item) =>
                        item === institution
                          ? event.target.checked
                          : institutions.includes(item),
                      ),
                    )
                  }
                />
                {INSTITUTIONS[institution].short}
              </label>
            </legend>
            {selected && (
              <label className="field study-compact-field">
                期数
                <input
                  aria-label={`${INSTITUTIONS[institution].short}の期数`}
                  type="number"
                  min={1}
                  max={MAX_INSTITUTION_PERIODS}
                  step={1}
                  required={selected}
                  value={periods[institution] || ""}
                  disabled={disabled || !selected}
                  onChange={(event) =>
                    onPeriodsChange({
                      ...periods,
                      [institution]: Number(event.target.value),
                    })
                  }
                />
              </label>
            )}
            {selected &&
              timing &&
              STUDY_TIMING_FIELDS.filter(
                (field) =>
                  field.institution === institution &&
                  (field.key === "buyerSeconds"
                    ? !postedBatch
                    : field.key === "purchaseSeconds"
                      ? postedBatch
                      : true),
              ).map(({ key, label }) => (
                <label className="field study-compact-field" key={key}>
                  {timingLabels[key]}
                  <input
                    aria-label={label}
                    type="number"
                    min={1}
                    max={MAX_STAGE_SECONDS}
                    step={1}
                    required={selected}
                    disabled={disabled || !selected}
                    value={
                      (key === "purchaseSeconds"
                        ? (timing.purchaseSeconds ??
                          (timing.buyerSeconds * marketSize) / 2)
                        : timing[key]) || ""
                    }
                    onChange={(event) =>
                      onTimingChange?.({
                        ...timing,
                        [key]: Number(event.target.value),
                      })
                    }
                  />
                </label>
              ))}
          </fieldset>
        );
      })}
    </div>
  );
}
