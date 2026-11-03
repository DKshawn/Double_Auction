"use client";
import type { EmhSettings, Exp2Options } from "../settings";

export function SettingsFields({
  settings,
  onChange,
  disabled = false,
  experiment = "exp1",
  demo = false,
}: {
  settings: EmhSettings;
  onChange: (settings: EmhSettings) => void;
  disabled?: boolean;
  experiment?: "exp1" | "exp2";
  demo?: boolean;
}) {
  const options = settings.exp2;
  function updateOptions(change: Partial<Exp2Options>) {
    if (options) onChange({ ...settings, exp2: { ...options, ...change } });
  }
  return (
    <fieldset className="emh-settings" disabled={disabled}>
      <legend>実験条件</legend>
      <div className="form-grid">
        <label className="field">
          ラウンド数
          <input
            type="number"
            min={1}
            max={experiment === "exp2" ? 6 : 12}
            step={1}
            required
            value={settings.rounds || ""}
            onChange={(e) =>
              onChange({ ...settings, rounds: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          1取引の時間（秒）
          <input
            type="number"
            min={1}
            max={1800}
            step={1}
            required
            value={settings.unitSeconds || ""}
            onChange={(e) =>
              onChange({ ...settings, unitSeconds: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          休憩時間（秒）
          <input
            type="number"
            min={1}
            max={1800}
            step={1}
            required
            value={settings.breakSeconds || ""}
            onChange={(e) =>
              onChange({ ...settings, breakSeconds: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          {experiment === "exp2"
            ? "各ラウンドの時間（分）"
            : "取引時間（A・B各期／分）"}
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
              onChange({
                ...settings,
                initialUnits: Number(e.target.value),
              })
            }
          />
        </label>
        <label className="field">
          1市場の目標人数
          <input
            type="number"
            name="targetMarketSize"
            min={3}
            max={experiment === "exp2" ? 999 : 12}
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
        {experiment === "exp2" && options && (
          <>
            <label className="field">
              連続不成立で終了する回数
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                required
                value={options.emptyUnitsLimit || ""}
                onChange={(e) =>
                  updateOptions({ emptyUnitsLimit: Number(e.target.value) })
                }
              />
            </label>
            {!demo && (
              <label className="field">
                市場数（空欄は自動）
                <input
                  type="number"
                  min={1}
                  max={333}
                  step={1}
                  value={options.marketCount ?? ""}
                  onChange={(e) =>
                    updateOptions({
                      marketCount:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            )}
            <label className="field">
              内部情報の開始ラウンド
              <input
                type="number"
                min={1}
                max={7}
                step={1}
                required
                value={options.insiderStartRound || ""}
                onChange={(e) =>
                  updateOptions({ insiderStartRound: Number(e.target.value) })
                }
              />
            </label>
            <label className="field">
              内部情報を持つ人数（各タイプ）
              <input
                type="number"
                min={0}
                max={999}
                step={1}
                required
                value={options.insiderCountPerType}
                onChange={(e) =>
                  updateOptions({ insiderCountPerType: Number(e.target.value) })
                }
              />
            </label>
          </>
        )}
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
        全員を{experiment === "exp2" ? "3〜999" : "3〜12"}
        人の市場に分け、各タイプを1人以上配置します。端数は実人数に合わせて調整します。
      </p>
      {experiment === "exp2" && options && (
        <p className="field-help">
          {!demo &&
            "市場数を指定すると、実際の参加者を指定した市場に均等に分けます。 "}
          内部情報は各タイプの人数を上限に配ります。開始ラウンドが実施回数より後の場合は配りません。
        </p>
      )}
      {experiment === "exp2" && options && (
        <details className="emh-exp2-conditions">
          <summary className="button secondary small-button disclosure-button">
            状態・配当の設定
          </summary>
          <fieldset className="emh-exp2-grid">
            <legend>状態の確率（%）</legend>
            <div className="emh-ratio-grid">
              {options.states.prior.map((probability, i) => (
                <label className="field" key={i}>
                  状態{i + 1}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    required
                    value={Math.round(probability * 1000000) / 10000}
                    onChange={(e) => {
                      const prior = [
                        ...options.states.prior,
                      ] as Exp2Options["states"]["prior"];
                      prior[i] = Number(e.target.value) / 100;
                      updateOptions({ states: { ...options.states, prior } });
                    }}
                  />
                </label>
              ))}
            </div>
            {Math.abs(
              options.states.prior.reduce((sum, n) => sum + n, 0) - 1,
            ) >= 0.000001 && (
              <p className="error-message" role="alert">
                確率の合計は100%にしてください。
              </p>
            )}
          </fieldset>
          <fieldset className="emh-exp2-grid">
            <legend>タイプ別・状態別の配当（円／単位）</legend>
            {options.states.dividends.map((values, type) => (
              <div className="emh-ratio-grid" key={type}>
                {values.map((value, state) => (
                  <label className="field" key={state}>
                    タイプ{type + 1}・状態{state + 1}
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      step={1}
                      required
                      value={value}
                      onChange={(e) => {
                        const dividends = structuredClone(
                          options.states.dividends,
                        );
                        dividends[type]![state] = Number(e.target.value);
                        updateOptions({
                          states: { ...options.states, dividends },
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
          <fieldset className="emh-exp2-grid">
            <legend>各ラウンドの実現状態</legend>
            <div className="emh-ratio-grid">
              {options.states.outcomes
                .slice(0, settings.rounds)
                .map((state, index) => (
                  <label className="field" key={index}>
                    第{index + 1}ラウンド
                    <select
                      value={state}
                      onChange={(e) => {
                        const outcomes = [
                          ...options.states.outcomes,
                        ] as Exp2Options["states"]["outcomes"];
                        outcomes[index] = Number(e.target.value);
                        updateOptions({
                          states: { ...options.states, outcomes },
                        });
                      }}
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          状態 {n}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
            </div>
          </fieldset>
        </details>
      )}
    </fieldset>
  );
}
