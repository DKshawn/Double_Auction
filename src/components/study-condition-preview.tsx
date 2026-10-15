import { useId } from "react";
import { equilibrium } from "@/lib/equilibrium";
import { StudyConditionChart } from "./study-condition-chart";
import type { StudySettings } from "@/lib/study-types";
import {
  studyCommissionEquilibrium,
  studyCommissionSchema,
} from "@/lib/study-commission";

export function StudyConditionPreview({
  settings,
  commission = 0,
  showUnitValues = true,
}: {
  settings: StudySettings;
  commission?: number;
  showUnitValues?: boolean;
}) {
  const demand = settings.values.flat().sort((a, b) => b - a);
  const supply = settings.costs.flat().sort((a, b) => a - b);
  const eq = equilibrium(demand, supply);
  const rewarded = studyCommissionSchema.safeParse(commission).success
    ? studyCommissionEquilibrium(settings, commission)
    : null;
  const price = (value: typeof eq | null) =>
    !value
      ? "—"
      : `${value.low === value.high ? value.low : `${value.low}〜${value.high}`} 円`;
  const quantity = (value: typeof eq | null) =>
    !value
      ? "—"
      : `${value.quantity === value.quantityMax ? value.quantity : `${value.quantity}〜${value.quantityMax}`} 単位`;
  const stats = [
    ["均衡価格", `${eq.low === eq.high ? eq.low : `${eq.low}〜${eq.high}`} 円`],
    ["均衡数量・下限", `${eq.quantity} 単位`],
    ["均衡数量・上限", `${eq.quantityMax} 単位`],
    ["正の余剰の単位数", `${eq.quantity} 単位`],
    ["ゼロ余剰の単位数", `${eq.quantityMax - eq.quantity} 単位`],
    ["最大総余剰", `${eq.surplus} 円`],
  ];
  return (
    <div className="study-condition-preview">
      <div
        className="study-table-wrap study-equilibrium-comparison"
        aria-live="polite"
      >
        <table>
          <caption>理論均衡の比較</caption>
          <thead>
            <tr>
              <th scope="col">計算条件</th>
              <th scope="col">均衡価格</th>
              <th scope="col">均衡数量</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">原始供需（Commissionなし）</th>
              <td>{price(eq)}</td>
              <td>{quantity(eq)}</td>
            </tr>
            <tr>
              <th scope="row">
                Commission込み（各
                {Number.isFinite(commission) ? commission : "—"}円／単位）
              </th>
              <td>{price(rewarded)}</td>
              <td>{quantity(rewarded)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="field-help">
        Commission込みは価値＋Commission、費用−Commissionで計算します。実際の注文価格や取引結果を保証するものではありません。最大総余剰・以下の図と単位表はCommissionを除く原始供需です。
      </p>
      <div
        className={`study-condition-preview-grid${showUnitValues ? "" : " study-chart-only"}`}
      >
        <div className="study-condition-plot">
          <dl className="study-condition-summary">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <StudyConditionChart
            key={`${demand.join(",")}:${supply.join(",")}`}
            demand={demand}
            supply={supply}
          />
        </div>
        {showUnitValues && <StudyUnitValues settings={settings} />}
      </div>
    </div>
  );
}

export function StudyUnitValues({
  settings,
  fixedHeading = false,
}: {
  settings: StudySettings;
  fixedHeading?: boolean;
}) {
  const titleId = useId();
  const demand = settings.values.flat().sort((a, b) => b - a);
  const supply = settings.costs.flat().sort((a, b) => a - b);
  const eq = equilibrium(demand, supply);
  const title = `全単位の数値（片側${demand.length}単位）`;
  return (
    <>
      {fixedHeading && <h2 id={titleId}>{title}</h2>}
      <div
        className="study-table-wrap study-unit-preview"
        tabIndex={0}
        role="region"
        aria-label="全単位の数値をスクロール"
      >
        <table aria-labelledby={fixedHeading ? titleId : undefined}>
          {!fixedHeading && <caption>{title}</caption>}
          <thead>
            <tr>
              <th scope="col">単位 k</th>
              <th scope="col">価値 D(k)</th>
              <th scope="col">費用 S(k)</th>
            </tr>
          </thead>
          <tbody>
            {demand.map((value, i) => (
              <tr
                key={i}
                className={
                  i >= eq.quantity && i < eq.quantityMax
                    ? "study-zero-surplus-row"
                    : undefined
                }
              >
                <th scope="row">{i + 1}</th>
                <td>{value}</td>
                <td>{supply[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
