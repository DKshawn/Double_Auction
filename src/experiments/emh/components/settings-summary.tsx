import type { EmhSettings } from "../settings";

export function SettingsSummary({
  settings,
  experiment = "exp1",
}: {
  settings: EmhSettings;
  experiment?: "exp1" | "exp2";
}) {
  return (
    <>
      <h2>確定した実験条件</h2>
      <dl className="emh-settings-summary">
        <div>
          <dt>ラウンド数</dt>
          <dd>{settings.rounds}回</dd>
        </div>
        <div>
          <dt>1取引</dt>
          <dd>{settings.unitSeconds}秒</dd>
        </div>
        <div>
          <dt>休憩</dt>
          <dd>{settings.breakSeconds}秒</dd>
        </div>
        <div>
          <dt>初期証券数</dt>
          <dd>1人 {settings.initialUnits}単位</dd>
        </div>
        <div>
          <dt>目標人数</dt>
          <dd>1市場 {settings.targetMarketSize}人</dd>
        </div>
        <div>
          <dt>人数比率</dt>
          <dd>{settings.typeRatios.join(" : ")}</dd>
        </div>
        {experiment === "exp2" && settings.exp2 && (
          <>
            <div>
              <dt>市場数</dt>
              <dd>{settings.exp2.marketCount ?? "自動"}</dd>
            </div>
            <div>
              <dt>連続不成立で終了</dt>
              <dd>{settings.exp2.emptyUnitsLimit}回</dd>
            </div>
            <div>
              <dt>内部情報</dt>
              <dd>
                第{settings.exp2.insiderStartRound}ラウンドから・各タイプ最大
                {settings.exp2.insiderCountPerType}人
              </dd>
            </div>
          </>
        )}
        <div>
          <dt>{experiment === "exp2" ? "各ラウンド" : "A・B各期"}</dt>
          <dd>{settings.periodSeconds}秒</dd>
        </div>
      </dl>
      {experiment === "exp2" && settings.exp2 && (
        <details className="emh-exp2-conditions">
          <summary className="button secondary small-button disclosure-button">
            状態・配当の条件
          </summary>
          <p>
            状態の確率：
            {settings.exp2.states.prior
              .map((n) => `${Math.round(n * 10000) / 100}%`)
              .join(" / ")}
          </p>
          {settings.exp2.states.dividends.map((values, i) => (
            <p key={i}>
              タイプ{i + 1}：{values.join(" / ")}円
            </p>
          ))}
          <p>
            実現状態：
            {settings.exp2.states.outcomes
              .slice(0, settings.rounds)
              .join(" / ")}
          </p>
        </details>
      )}
    </>
  );
}
