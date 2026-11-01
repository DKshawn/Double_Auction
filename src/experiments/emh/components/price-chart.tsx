"use client";
import type { RoomView, Trade } from "@/experiments/emh/types";

export function PriceChart({
  trades,
  benchmarks,
}: {
  trades: Trade[];
  benchmarks: RoomView["benchmarks"];
}) {
  const W = 700,
    H = 240,
    left = 46,
    right = 24,
    top = 24,
    bottom = 36;
  const values = trades.map((t) => t.price);
  if (benchmarks)
    values.push(benchmarks.naiveA, benchmarks.perfectA, benchmarks.perfectB);
  const maximum = values.length ? Math.max(...values) : 400;
  const minimum = values.length ? Math.min(...values) : 0;
  const pad = Math.max(20, (maximum - minimum) * 0.16);
  const low = Math.max(0, Math.floor((minimum - pad) / 10) * 10);
  const high = Math.ceil((maximum + pad) / 10) * 10;
  const x = (i: number) =>
    left +
    (trades.length > 1 ? i / (trades.length - 1) : 0.5) * (W - left - right);
  const y = (v: number) =>
    H - bottom - ((v - low) / (high - low)) * (H - top - bottom);
  const a = trades
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.period === "A");
  const b = trades
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.period === "B");
  const series = (points: typeof a) =>
    points.map(({ t, i }) => `${x(i)},${y(t.price)}`).join(" ");
  const mid = a.length && b.length ? (x(a.at(-1)!.i) + x(b[0]!.i)) / 2 : null;
  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          trades.length
            ? `取引価格。${trades.length}件、最終価格${trades.at(-1)!.price}。A期は紫、B期は青緑。`
            : "取引価格。まだ取引はありません。"
        }
      >
        {Array.from({ length: 5 }, (_, i) => low + ((high - low) * i) / 4).map(
          (v, i) => (
            <g key={i}>
              <line
                x1={left}
                x2={W - right}
                y1={y(v)}
                y2={y(v)}
                className="chart-grid"
              />
              <text
                x={left - 10}
                y={y(v) + 4}
                textAnchor="end"
                className="chart-axis"
              >
                {Math.round(v)}
              </text>
            </g>
          ),
        )}
        {benchmarks && (
          <>
            {[
              {
                value: benchmarks.perfectA,
                label: `PF A ${benchmarks.perfectA}`,
                color: "var(--period-a)",
              },
              {
                value: benchmarks.naiveA,
                label: `Naive A ${benchmarks.naiveA}`,
                color: "var(--sell)",
              },
              {
                value: benchmarks.perfectB,
                label: `PF B ${benchmarks.perfectB}`,
                color: "var(--period-b)",
              },
            ].map((line, i) => (
              <g key={i}>
                <line
                  x1={left}
                  x2={W - right}
                  y1={y(line.value)}
                  y2={y(line.value)}
                  stroke={line.color}
                  strokeDasharray="4 5"
                  opacity=".6"
                />
                <text
                  x={W - right}
                  y={y(line.value) - 5}
                  textAnchor="end"
                  fill={line.color}
                  fontSize="10"
                >
                  {line.label}
                </text>
              </g>
            ))}
          </>
        )}
        {mid !== null && (
          <line
            x1={mid}
            x2={mid}
            y1={top}
            y2={H - bottom}
            stroke="var(--line)"
            strokeDasharray="3 4"
          />
        )}
        <polyline
          points={series(a)}
          fill="none"
          stroke="var(--period-a)"
          strokeWidth="2"
        />
        <polyline
          points={series(b)}
          fill="none"
          stroke="var(--period-b)"
          strokeWidth="2"
        />
        {trades.map((t, i) => (
          <circle
            key={t.id}
            cx={x(i)}
            cy={y(t.price)}
            r="4"
            fill={t.period === "A" ? "var(--period-a)" : "var(--period-b)"}
            stroke="var(--surface)"
            strokeWidth="1.5"
          >
            <title>{`${t.period}期 取引${i + 1}: ${t.price} / 買い手${t.buyerSeat}・売り手${t.sellerSeat}`}</title>
          </circle>
        ))}
        {!trades.length && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="chart-empty">
            成立した取引がここに表示されます
          </text>
        )}
        <text x={left} y={H - 10} className="chart-axis">
          {trades.length ? "1" : ""}
        </text>
        <text x={W - right} y={H - 10} textAnchor="end" className="chart-axis">
          {trades.length ? `${trades.length} 件目` : "取引順"}
        </text>
      </svg>
      <div className="chart-legend">
        <span>
          <i className="dot period-a" />
          A期
        </span>
        <span>
          <i className="dot period-b" />
          B期
        </span>
      </div>
    </div>
  );
}
