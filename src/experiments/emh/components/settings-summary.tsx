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
        <div>
          <dt>{experiment === "exp2" ? "各ラウンド" : "A・B各期"}</dt>
          <dd>{settings.periodSeconds}秒</dd>
        </div>
      </dl>
    </>
  );
}
