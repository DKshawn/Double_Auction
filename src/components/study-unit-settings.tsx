import { INSTITUTIONS } from "@/lib/study-rules";
import {
  DEFAULT_STUDY_INSTITUTIONS,
  MAX_STUDY_UNITS,
} from "@/lib/study-config";
import type { Institution } from "@/lib/study-types";

export function StudyUnitFields({
  units,
  onChange,
  disabled,
  institutions = DEFAULT_STUDY_INSTITUTIONS,
}: {
  units: Record<Institution, string>;
  onChange: (institution: Institution, units: string) => void;
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
              value={units[institution]}
              onChange={(e) => onChange(institution, e.target.value)}
              disabled={disabled}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
