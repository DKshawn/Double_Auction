import { INSTITUTIONS } from "@/lib/study-rules";
import { MAX_STUDY_UNITS } from "@/lib/study-config";

export function StudyUnitFields({
  cdaUnits,
  onChange,
  disabled,
  cdaEnabled = true,
}: {
  cdaUnits: string;
  onChange: (units: string) => void;
  disabled: boolean;
  cdaEnabled?: boolean;
}) {
  return (
    <fieldset className="study-unit-settings">
      <legend>1人あたりの単位数</legend>
      <div className="study-unit-fields">
        {(["cda", "call", "posted"] as const).map((institution) => (
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
              disabled={disabled || institution !== "cda" || !cdaEnabled}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
