"use client";

import { useState } from "react";
import { decimal } from "@/lib/client";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { StudyView } from "@/lib/study-types";
import type { RoomView } from "@/lib/types";

export function StudyMarketOverview({
  teacher,
  phase,
  now,
  selected,
  onSelect,
  demo,
}: {
  teacher: NonNullable<StudyView["teacher"]>;
  phase: RoomView["phase"];
  now: number;
  selected: number;
  onSelect: (market: number) => void;
  demo: boolean;
}) {
  const [chosenRound, setChosenRound] = useState<number | null>(null);
  const currentRound = Math.max(...teacher.markets.map((m) => m.round));
  // Metrics are already calculated per market and period on the server.
  // In particular, Call quantity includes all clearings in the selected period.
  const metrics = new Map(
    teacher.metrics.map((row) => [`${row.market}:${row.round}`, row]),
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
          集計する期
          <select
            value={chosenRound ?? "latest"}
            disabled={currentRound === 0}
            onChange={(event) =>
              setChosenRound(
                event.target.value === "latest"
                  ? null
                  : Number(event.target.value),
              )
            }
          >
            <option value="latest">各市場の現在の期</option>
            {Array.from({ length: currentRound }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                第{index + 1}期
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        {chosenRound === null
          ? "各市場の現在の期を集計（Callは4回分）。期の右の時間は現在の段階の残り時間です。"
          : `第${chosenRound}期の集計です。進行期・残り時間・入室・状態は現在の状況です。`}
        市場名を押すと詳細を切り替えます。
      </p>
      <div className="study-overview-table">
        <table
          aria-label={
            chosenRound === null
              ? "全市場の現在の進行状況と結果"
              : `第${chosenRound}期の全市場の結果`
          }
        >
          <thead>
            <tr>
              <th scope="col">市場</th>
              <th scope="col">{chosenRound === null ? "制度" : "集計制度"}</th>
              <th scope="col">進行期</th>
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
              const round = chosenRound ?? market.round;
              const metric = metrics.get(`${market.id}:${round}`);
              const institution =
                metric?.institution ??
                market.order[Math.floor((Math.max(1, round) - 1) / 5)];
              const currentMetric = metrics.get(`${market.id}:${market.round}`);
              const state =
                market.stage === "done" || phase === "finished"
                  ? currentMetric?.completion === "complete"
                    ? "complete"
                    : "interrupted"
                  : phase === "paused"
                    ? "paused"
                    : market.stage === "waiting"
                      ? "waiting"
                      : "running";
              const status = {
                waiting: phase === "waiting" ? "開始前" : "入室待ち",
                complete: "実験終了",
                interrupted: "途中終了",
                paused: "一時停止",
                running:
                  market.stage === "call"
                    ? `受付 ${market.call}/4`
                    : market.stage === "offer"
                      ? "価格提示"
                      : "取引中",
              }[state];
              const remaining =
                phase === "running" && market.deadline !== null
                  ? Math.max(0, market.deadline - now)
                  : market.remainingMs;
              const seconds = Math.ceil(remaining / 1000);
              const time = !market.round
                ? "--:--"
                : ["complete", "interrupted"].includes(state)
                  ? "終了"
                  : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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
                  <td>
                    <span className="study-market-progress">
                      <span>{market.round ? `第${market.round}期` : "—"}</span>
                      <span
                        className="study-market-timer"
                        aria-label={`市場${market.id}・${status}・残り時間 ${time}`}
                      >
                        {time}
                      </span>
                    </span>
                  </td>
                  <td>
                    {market.participantCount}/
                    {teacher.settings.values.length +
                      teacher.settings.costs.length}
                  </td>
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
          市場1はあなた＋仮想参加者15人。他市場は全員が仮想参加者です。
        </p>
      )}
    </section>
  );
}
