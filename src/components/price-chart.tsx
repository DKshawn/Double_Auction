"use client";

import { useEffect, useRef, useState } from "react";
import type { Equilibrium, Trade } from "@/lib/types";

export type PriceChartSeries = {
  id: string;
  label: string;
  trades: Trade[];
};

const SERIES_COLORS = [
  "#5850c5",
  "#087f8c",
  "#b55d13",
  "#c03669",
  "#387c34",
  "#2868ba",
  "#9252a1",
  "#9c7110",
  "#526470",
  "#bb4336",
  "#487176",
  "#665b32",
];

type PriceChartProps = {
  equilibrium?: Equilibrium;
  rounds?: number;
  compact?: boolean;
  periodAxis?: boolean;
  fill?: boolean;
  ariaLabel?: string;
} & (
  | { trades: Trade[]; series?: never }
  | { trades?: never; series: PriceChartSeries[] }
);

export function PriceChart({
  trades,
  series,
  equilibrium,
  rounds = 1,
  compact = false,
  periodAxis = false,
  fill = false,
  ariaLabel,
}: PriceChartProps) {
  const root = useRef<HTMLDivElement>(null);
  const [w, setWidth] = useState(compact ? 360 : 640);
  const [height, setHeight] = useState(220);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(250, Math.floor(entry.contentRect.width)));
      if (fill) setHeight(Math.max(190, Math.floor(entry.contentRect.height)));
    });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [fill]);
  const h = fill ? height : compact ? 190 : 220;
  const left = 45,
    right = 20,
    top = 24,
    bottom = 35;
  const groups = (
    series ?? [{ id: "prices", label: "", trades: trades ?? [] }]
  ).map((group, index) => ({
    ...group,
    color: series ? SERIES_COLORS[index % SERIES_COLORS.length] : undefined,
    dash: series && index >= SERIES_COLORS.length ? "6 3" : undefined,
  }));
  const prices = groups.flatMap((group) => group.trades.map((t) => t.price));
  const hasTrades = prices.length > 0;
  if (equilibrium) prices.push(equilibrium.low, equilibrium.high);
  const min = prices.length
    ? Math.max(0, Math.floor((Math.min(...prices) - 10) / 10) * 10)
    : 0;
  const max = prices.length
    ? Math.ceil((Math.max(...prices) + 10) / 10) * 10
    : 100;
  const y = (price: number) =>
    top + ((max - price) / (max - min || 1)) * (h - top - bottom);
  const width = w - left - right;
  const periodTickStep = Math.max(
    1,
    Math.ceil((rounds - 1) / Math.max(1, Math.floor(width / 34) - 1)),
  );
  const byPeriod = Boolean(equilibrium || periodAxis);
  return (
    <>
      {series && (
        <ul className="price-chart-legend" aria-label="市場の凡例">
          {groups.map((group) => (
            <li key={group.id}>
              <svg
                width="24"
                height="12"
                viewBox="0 0 24 12"
                aria-hidden="true"
              >
                <line
                  x1="1"
                  x2="23"
                  y1="6"
                  y2="6"
                  stroke={group.color}
                  strokeWidth="3"
                  strokeDasharray={group.dash}
                />
              </svg>
              {group.label}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={root}
        className={`price-chart ${compact ? "compact" : ""} ${fill ? "fill" : ""}`}
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={
            ariaLabel ??
            (equilibrium
              ? "ラウンドごとの取引価格（円）。色付きの帯は理論上の均衡価格区間です。"
              : periodAxis
                ? "全期間の取引価格（円）を期ごとに表示したグラフ"
                : "今ラウンドの取引価格（円）を約定順に表示したグラフ")
          }
        >
          <text x={left - 10} y={12} textAnchor="end">
            円
          </text>
          {[0, 1, 2, 3, 4].map((tick) => {
            const p = min + ((max - min) * tick) / 4;
            return (
              <g key={tick}>
                <line
                  x1={left}
                  x2={w - right}
                  y1={y(p)}
                  y2={y(p)}
                  className="chart-grid"
                />
                <text x={left - 10} y={y(p) + 4} textAnchor="end">
                  {Math.round(p)}
                </text>
              </g>
            );
          })}
          {equilibrium && (
            <>
              <rect
                x={left}
                y={y(equilibrium.high)}
                width={width}
                height={Math.max(3, y(equilibrium.low) - y(equilibrium.high))}
                className="equilibrium-band"
              />
              <line
                x1={left}
                x2={w - right}
                y1={y((equilibrium.low + equilibrium.high) / 2)}
                y2={y((equilibrium.low + equilibrium.high) / 2)}
                className="equilibrium-line"
              />
            </>
          )}
          {byPeriod ? (
            Array.from({ length: rounds }, (_, i) => (
              <g key={i}>
                {(i === 0 ||
                  i === rounds - 1 ||
                  (i % periodTickStep === 0 &&
                    rounds - 1 - i >= periodTickStep)) && (
                  <text
                    x={left + ((i + 0.5) / rounds) * width}
                    y={h - 10}
                    textAnchor="middle"
                  >
                    {i + 1}
                  </text>
                )}
                {i > 0 && (
                  <line
                    x1={left + (i / rounds) * width}
                    x2={left + (i / rounds) * width}
                    y1={top}
                    y2={h - bottom}
                    className="chart-round-line"
                  />
                )}
              </g>
            ))
          ) : (
            <>
              <text x={left} y={h - 10}>
                最初の取引
              </text>
              <text x={w - right} y={h - 10} textAnchor="end">
                約定順 →
              </text>
            </>
          )}
          {groups.map((group) => {
            const counts = new Map<number, number>();
            const positions = new Map<number, number>();
            for (const trade of group.trades)
              counts.set(trade.round, (counts.get(trade.round) ?? 0) + 1);
            const points = group.trades.map((trade, index) => {
              const position = (positions.get(trade.round) ?? 0) + 1;
              positions.set(trade.round, position);
              const fraction = byPeriod
                ? (trade.round -
                    1 +
                    position / (counts.get(trade.round)! + 1)) /
                  rounds
                : (index + 0.5) / Math.max(6, group.trades.length);
              return { trade, x: left + fraction * width, y: y(trade.price) };
            });
            const lines = new Map<number, typeof points>();
            for (const point of points) {
              const key = byPeriod ? point.trade.round : 0;
              const line = lines.get(key) ?? [];
              line.push(point);
              lines.set(key, line);
            }
            return (
              <g key={group.id} aria-label={group.label || undefined}>
                {[...lines]
                  .filter(([, points]) => points.length > 1)
                  .map(([round, points]) => (
                    <polyline
                      key={round}
                      points={points
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                      className="chart-series"
                      style={{
                        stroke: group.color,
                        strokeDasharray: group.dash,
                      }}
                    />
                  ))}
                {points.map(({ trade, x, y }) => (
                  <circle
                    key={trade.id}
                    cx={x}
                    cy={y}
                    r={4.5}
                    className="chart-dot"
                    style={{ fill: group.color }}
                  >
                    <title>
                      {`${group.label ? `${group.label}・` : ""}${periodAxis ? "第" : "ラウンド"}${trade.round}${periodAxis ? "期" : ""}：${trade.price}円`}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
          {!hasTrades && (
            <text
              x={w / 2}
              y={h / 2 - (equilibrium ? 25 : 0)}
              textAnchor="middle"
              className="chart-empty"
            >
              取引が成立すると、ここに価格が表示されます
            </text>
          )}
        </svg>
      </div>
    </>
  );
}
