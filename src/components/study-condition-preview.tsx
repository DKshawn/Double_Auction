import { useId } from "react";
import { equilibrium } from "@/lib/equilibrium";
import { staircasePoints } from "@/lib/study-generator";
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
  const titleId = useId();
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
  const count = demand.length;
  const lowest = Math.min(...supply, ...demand);
  const highest = Math.max(...supply, ...demand);
  const padding = Math.max(4, (highest - lowest) / 8);
  const bottom = Math.max(0, Math.floor((lowest - padding) / 4) * 4);
  const top = Math.ceil((highest + padding) / 4) * 4;
  const x = (q: number) => 60 + (q / count) * 650;
  const y = (price: number) => 255 - ((price - bottom) / (top - bottom)) * 215;
  const points = (units: number[]) =>
    staircasePoints(units)
      .map(([q, price]) => `${x(q).toFixed(2)},${y(price).toFixed(2)}`)
      .join(" ");
  const xTicks = [
    ...new Set([
      0,
      count,
      eq.quantity,
      eq.quantityMax,
      ...Array.from({ length: 5 }, (_, i) => Math.round(((i + 1) * count) / 6)),
    ]),
  ].sort((a, b) => a - b);
  const yTicks = Array.from(
    { length: 5 },
    (_, i) => bottom + ((top - bottom) * i) / 4,
  );
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
      <dl className="study-condition-summary">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div
        className={`study-condition-preview-grid${showUnitValues ? "" : " study-chart-only"}`}
      >
        <figure className="study-condition-chart">
          <svg viewBox="0 0 760 310" role="img" aria-labelledby={titleId}>
            <title id={titleId}>
              数量に対応する買い手の限界価値と売り手の限界費用の階段供需図
            </title>
            {yTicks.map((price) => (
              <g key={price}>
                <line
                  x1={60}
                  x2={710}
                  y1={y(price)}
                  y2={y(price)}
                  className="study-curve-grid"
                />
                <text x={50} y={y(price) + 4} textAnchor="end">
                  {price}
                </text>
              </g>
            ))}
            {xTicks.map((q) => (
              <g key={q}>
                <line
                  x1={x(q)}
                  x2={x(q)}
                  y1={40}
                  y2={255}
                  className="study-curve-grid"
                />
                <text x={x(q)} y={277} textAnchor="middle">
                  {q}
                </text>
              </g>
            ))}
            <text x={60} y={23}>
              限界価値・費用（円）
            </text>
            <text x={710} y={301} textAnchor="end">
              数量（単位）
            </text>
            <polyline points={points(demand)} className="study-demand-curve" />
            <polyline points={points(supply)} className="study-supply-curve" />
            {eq.quantityMax > eq.quantity && (
              <g>
                <line
                  x1={x(eq.quantity)}
                  x2={x(eq.quantityMax)}
                  y1={y(eq.low)}
                  y2={y(eq.low)}
                  className="study-overlap-curve"
                />
                <text
                  x={(x(eq.quantity) + x(eq.quantityMax)) / 2}
                  y={y(eq.low) - 13}
                  textAnchor="middle"
                  className="study-overlap-label"
                >
                  重なり {eq.quantity}〜{eq.quantityMax} · {eq.low}円
                </text>
              </g>
            )}
          </svg>
          <div className="study-curve-legend">
            <span className="demand">買い手の価値 D(k)</span>
            <span className="supply">売り手の費用 S(k)</span>
            <span className="overlap">横向きの重なり</span>
          </div>
          <figcaption>
            第k単位は数量k−1〜kを覆います。参加者の実際の注文価格ではありません。
          </figcaption>
        </figure>
        {showUnitValues && <StudyUnitValues settings={settings} />}
      </div>
    </div>
  );
}

export function StudyUnitValues({ settings }: { settings: StudySettings }) {
  const demand = settings.values.flat().sort((a, b) => b - a);
  const supply = settings.costs.flat().sort((a, b) => a - b);
  const eq = equilibrium(demand, supply);
  return (
    <div className="study-table-wrap study-unit-preview">
      <table>
        <caption>全単位の数値（片側{demand.length}単位）</caption>
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
  );
}
