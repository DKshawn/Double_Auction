import { INSTITUTIONS } from "@/lib/study-rules";
import {
  DEFAULT_STUDY_INSTITUTIONS,
  MAX_STUDY_UNITS,
} from "@/lib/study-config";
import type { Institution } from "@/lib/study-types";

export function StudyUnitFields({
  cdaUnits,
  onChange,
  disabled,
  institutions = DEFAULT_STUDY_INSTITUTIONS,
}: {
  cdaUnits: string;
  onChange: (units: string) => void;
  disabled: boolean;
  institutions?: readonly Institution[];
}) {
  return (
    <fieldset className="study-unit-settings">
      <legend>1人あたりの単位数</legend>
      <div className="study-unit-fields">
        {institutions.map((institution) => (
          <label className="field" key={institution}>
            {INSTITUTIONS[institution].short}
            <input
              aria-label={`${INSTITUTIONS[institution].short}の1人あたりの単位数`}
              type="number"
              min={1}
              max={MAX_STUDY_UNITS}
              step={1}
              required
              value={institution === "cda" ? cdaUnits : 2}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled || institution !== "cda"}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
