"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { staircasePoints } from "@/lib/study-generator";
import { studyChartTicks, studyChartViewport } from "@/lib/study-chart";

export function StudyConditionChart({
  demand,
  supply,
}: {
  demand: number[];
  supply: number[];
}) {
  const titleId = useId();
  const clipId = useId();
  const [zoom, setZoom] = useState(1);
  const view = studyChartViewport(demand, supply, zoom);
  const { eq } = view;
  const x = (q: number) =>
    60 + ((q - view.quantityMin) / (view.quantityMax - view.quantityMin)) * 650;
  const y = (price: number) =>
    255 - ((price - view.priceMin) / (view.priceMax - view.priceMin)) * 215;
  const points = (units: number[]) =>
    staircasePoints(units)
      .map(([q, price]) => `${x(q).toFixed(2)},${y(price).toFixed(2)}`)
      .join(" ");
  const xTicks = studyChartTicks(
    Math.max(0, view.quantityMin),
    Math.min(view.count, view.quantityMax),
  );
  const yTicks = studyChartTicks(Math.max(0, view.priceMin), view.priceMax);
  const format = (n: number) => Number(n.toFixed(1));
  const equilibriumLabel = `${eq.quantityMax > eq.quantity ? "重なり" : "均衡"} ${eq.quantity === eq.quantityMax ? eq.quantity : `${eq.quantity}〜${eq.quantityMax}`} · ${eq.low === eq.high ? eq.low : `${eq.low}〜${eq.high}`}円`;

  return (
    <figure className="study-condition-chart">
      <div
        className="study-condition-chart-controls"
        role="group"
        aria-label="供需図の表示"
      >
        <button
          type="button"
          className="button secondary"
          aria-label="供需図を縮小"
          disabled={view.zoom <= view.minZoom}
          onClick={() =>
            setZoom((current) => Math.max(view.minZoom, current / 1.5))
          }
        >
          <Minus size={14} aria-hidden="true" /> 縮小
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label="供需図を拡大"
          disabled={view.zoom >= 8}
          onClick={() => setZoom((current) => Math.min(8, current * 1.5))}
        >
          <Plus size={14} aria-hidden="true" /> 拡大
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => setZoom(view.minZoom)}
        >
          全体
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => setZoom(1)}
        >
          初期表示
        </button>
        <output className="study-chart-range" aria-live="polite">
          表示数量 {format(Math.max(0, view.quantityMin))}〜
          {format(Math.min(view.count, view.quantityMax))} / {view.count}単位
        </output>
      </div>
      <svg viewBox="0 0 760 310" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          数量に対応する買い手の限界価値と売り手の限界費用の階段供需図
        </title>
        <defs>
          <clipPath id={clipId}>
            <rect x={60} y={40} width={650} height={215} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {view.quantityMin < 0 && (
            <rect
              x={60}
              y={40}
              width={x(0) - 60}
              height={215}
              className="study-chart-outside-range"
            />
          )}
          {view.quantityMax > view.count && (
            <rect
              x={x(view.count)}
              y={40}
              width={710 - x(view.count)}
              height={215}
              className="study-chart-outside-range"
            />
          )}
        </g>
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
        <g clipPath={`url(#${clipId})`}>
          <polyline points={points(demand)} className="study-demand-curve" />
          <polyline points={points(supply)} className="study-supply-curve" />
          <line
            x1={x(eq.quantity)}
            x2={x(eq.quantityMax)}
            y1={y(eq.low)}
            y2={y(eq.high)}
            className="study-overlap-curve"
          />
          <circle
            cx={x(view.quantityCenter)}
            cy={y(view.priceCenter)}
            r={4}
            className="study-equilibrium-point"
          />
        </g>
        <text
          x={x(view.quantityCenter)}
          y={Math.max(54, y(eq.high) - 13)}
          textAnchor="middle"
          className="study-overlap-label"
        >
          {equilibriumLabel}
        </text>
      </svg>
      <div className="study-curve-legend">
        <span className="demand">買い手の価値 D(k)</span>
        <span className="supply">売り手の費用 S(k)</span>
        <span className="overlap">均衡範囲</span>
      </div>
      <figcaption>
        均衡範囲の中心を表示します。第k単位は数量k−1〜kを覆います。参加者の実際の注文価格ではありません。
      </figcaption>
    </figure>
  );
}
