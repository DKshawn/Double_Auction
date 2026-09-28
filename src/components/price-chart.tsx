"use client";

import { useEffect, useRef, useState } from "react";
import type { Equilibrium, Trade } from "@/lib/types";

export function PriceChart({
  trades,
  equilibrium,
  rounds = 1,
  compact = false,
  periodAxis = false,
}: {
  trades: Trade[];
  equilibrium?: Equilibrium;
  rounds?: number;
  compact?: boolean;
  periodAxis?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [w, setWidth] = useState(compact ? 360 : 640);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(250, Math.floor(entry.contentRect.width))),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const h = compact ? 190 : 220;
  const left = 45,
    right = 20,
    top = 24,
    bottom = 35;
  const prices = trades.map((t) => t.price);
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
  const byPeriod = Boolean(equilibrium || periodAxis);
  const point = (trade: Trade, index: number) => {
    if (!byPeriod)
      return left + ((index + 0.5) / Math.max(6, trades.length)) * width;
    const sameRound = trades.filter((t) => t.round === trade.round);
    const n = sameRound.findIndex((t) => t.id === trade.id);
    return (
      left +
      ((trade.round - 1 + (n + 1) / (sameRound.length + 1)) / rounds) * width
    );
  };
  return (
    <div ref={root} className={`price-chart ${compact ? "compact" : ""}`}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={
          equilibrium
            ? "ラウンドごとの取引価格（円）。色付きの帯は理論上の均衡価格区間です。"
            : periodAxis
              ? "全期間の取引価格（円）を期ごとに表示したグラフ"
              : "今ラウンドの取引価格（円）を約定順に表示したグラフ"
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
              <text
                x={left + ((i + 0.5) / rounds) * width}
                y={h - 10}
                textAnchor="middle"
              >
                {i + 1}
              </text>
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
        {trades.length > 1 &&
          (byPeriod ? (
            Array.from({ length: rounds }, (_, i) => (
              <polyline
                key={i}
                points={trades
                  .map((t, n) => ({ t, n }))
                  .filter(({ t }) => t.round === i + 1)
                  .map(({ t, n }) => `${point(t, n)},${y(t.price)}`)
                  .join(" ")}
                className="chart-series"
              />
            ))
          ) : (
            <polyline
              points={trades
                .map((t, i) => `${point(t, i)},${y(t.price)}`)
                .join(" ")}
              className="chart-series"
            />
          ))}
        {trades.map((t, i) => (
          <circle
            key={t.id}
            cx={point(t, i)}
            cy={y(t.price)}
            r={4.5}
            className="chart-dot"
          >
            <title>
              {periodAxis ? "第" : "ラウンド"}
              {t.round}
              {periodAxis ? "期" : ""}：{t.price}円
            </title>
          </circle>
        ))}
        {!trades.length && (
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
  );
}
