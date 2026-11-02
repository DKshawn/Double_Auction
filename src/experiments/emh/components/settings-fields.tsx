"use client";
import type { EmhSettings } from "../settings";

export function SettingsFields({
  settings,
  onChange,
  disabled = false,
}: {
  settings: EmhSettings;
  onChange: (settings: EmhSettings) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="emh-settings" disabled={disabled}>
      <legend>実験条件</legend>
      <div className="form-grid">
        <label className="field">
          1人あたりの初期証券数（各ラウンド）
          <input
            type="number"
            name="initialUnits"
            min={1}
            max={20}
            step={1}
            required
            value={settings.initialUnits || ""}
            onChange={(e) =>
              onChange({ ...settings, initialUnits: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          1市場の目標人数
          <input
            type="number"
            name="targetMarketSize"
            min={3}
            max={12}
            step={1}
            required
            value={settings.targetMarketSize || ""}
            onChange={(e) =>
              onChange({
                ...settings,
                targetMarketSize: Number(e.target.value),
              })
            }
          />
        </label>
        <label className="field">
          取引時間（A・B各期／分）
          <input
            type="number"
            name="periodMinutes"
            min={1}
            max={30}
            step="any"
            required
            value={settings.periodSeconds / 60 || ""}
            onChange={(e) =>
              onChange({
                ...settings,
                periodSeconds: Math.round(Number(e.target.value) * 60),
              })
            }
          />
        </label>
      </div>
      <fieldset className="emh-type-ratios">
        <legend>タイプ別人数の比率</legend>
        <div className="emh-ratio-grid">
          {settings.typeRatios.map((value, i) => (
            <label className="field" key={i}>
              タイプ{i + 1}
              <input
                type="number"
                name={`typeRatio${i + 1}`}
                min={1}
                max={100}
                step={1}
                required
                value={value || ""}
                onChange={(e) => {
                  const typeRatios = [
                    ...settings.typeRatios,
                  ] as EmhSettings["typeRatios"];
                  typeRatios[i] = Number(e.target.value);
                  onChange({ ...settings, typeRatios });
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <p className="field-help">
        全員を3〜12人の市場に分け、各タイプを1人以上配置します。端数は実人数に合わせて調整します。
      </p>
    </fieldset>
  );
}
