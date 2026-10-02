"use client";

import { useState } from "react";
import { decimal } from "@/lib/client";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { StudyView } from "@/lib/study-types";
import type { RoomView } from "@/lib/types";

export function StudyMarketOverview({
  teacher,
  currentRound,
  phase,
  selected,
  onSelect,
  demo,
}: {
  teacher: NonNullable<StudyView["teacher"]>;
  currentRound: number;
  phase: RoomView["phase"];
  selected: number;
  onSelect: (market: number) => void;
  demo: boolean;
}) {
  const [chosenRound, setChosenRound] = useState<number | null>(null);
  const round = Math.min(chosenRound ?? currentRound, currentRound);
  // Metrics are already calculated per market and period on the server.
  // In particular, Call quantity includes all clearings in the selected period.
  const metrics = new Map(
    teacher.metrics
      .filter((row) => row.round === round)
      .map((row) => [row.market, row]),
  );

  return (
    <section
      className="panel study-section study-market-overview"
      aria-label="全市場の結果"
    >
      <div className="study-overview-heading">
        <h2>
          全市場の結果 <small>{teacher.markets.length}市場</small>
        </h2>
        <label className="field">
          表示する期
          <select
            value={chosenRound === null ? "latest" : round}
            disabled={currentRound === 0}
            onChange={(event) =>
              setChosenRound(
                event.target.value === "latest"
                  ? null
                  : Number(event.target.value),
              )
            }
          >
            <option value="latest">
              {currentRound ? `第${currentRound}期（最新）` : "開始前"}
            </option>
            {Array.from({ length: currentRound }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                第{index + 1}期
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        数量は選択した期の合計（Callは4回分）。市場名を押すと詳細を切り替えます。
      </p>
      <div className="study-overview-table">
        <table
          aria-label={
            currentRound ? `第${round}期の全市場の結果` : "全市場の入室状況"
          }
        >
          <thead>
            <tr>
              <th scope="col">市場</th>
              <th scope="col">制度</th>
              <th scope="col">入室</th>
              <th scope="col">状態</th>
              <th scope="col">数量</th>
              <th scope="col">平均（円）</th>
              <th scope="col">Smith α</th>
              <th scope="col">効率（%）</th>
            </tr>
          </thead>
          <tbody>
            {teacher.markets.map((market) => {
              const metric = metrics.get(market.id);
              const institution =
                metric?.institution ??
                market.order[Math.floor((Math.max(1, round) - 1) / 5)];
              const state = !metric
                ? "waiting"
                : metric.completion !== "running"
                  ? metric.completion
                  : phase === "paused"
                    ? "paused"
                    : "running";
              const status = {
                waiting: "開始前",
                complete: "完了",
                interrupted: "途中終了",
                paused: "一時停止",
                running:
                  market.stage === "call"
                    ? `受付 ${market.call}/4`
                    : market.stage === "offer"
                      ? "価格提示"
                      : "取引中",
              }[state];
              return (
                <tr
                  key={market.id}
                  className={
                    market.id === selected ? "selected-row" : undefined
                  }
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`市場${market.id}の詳細を表示`}
                      aria-pressed={market.id === selected}
                      onClick={() => onSelect(market.id)}
                    >
                      市場{market.id}
                    </button>
                  </th>
                  <td>{INSTITUTIONS[institution].short}</td>
                  <td>{market.participantCount}/16</td>
                  <td>
                    <span className={`study-overview-status ${state}`}>
                      {status}
                    </span>
                  </td>
                  <td>{decimal(metric?.quantity)}</td>
                  <td>{decimal(metric?.mean)}</td>
                  <td>
                    {metric?.alpha == null ? "—" : metric.alpha.toFixed(4)}
                  </td>
                  <td>{decimal(metric?.efficiency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {demo && (
        <p className="study-overview-note">
          デモは1市場です。正式実験では全市場の結果がここに並びます。
        </p>
      )}
    </section>
  );
}
