"use client";

import { useId, useRef, useState } from "react";
import { decimal, timeLabel } from "@/lib/client";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { StudyMarketView, StudyOrderHistory } from "@/lib/study-types";

const ORDER_STATUS: Record<StudyOrderHistory["status"], string> = {
  replaced: "変更済み",
  cancelled: "取消済み",
  filled: "約定済み",
  expired: "期終了",
  interrupted: "中断終了",
};

export function StudyMarketHistory({
  trades,
  orders,
  participantId,
  showParticipants = false,
  standalone = false,
}: {
  trades: StudyMarketView["trades"];
  orders: StudyMarketView["orderHistory"];
  participantId?: string;
  showParticipants?: boolean;
  standalone?: boolean;
}) {
  const [mode, setMode] = useState<"orders" | "trades">("orders");
  const panelId = useId();
  const list = useRef<HTMLDivElement>(null);
  const showOrders = mode === "orders";
  const label = showOrders ? "注文履歴" : "歩み値";
  const newestFirst = showOrders ? orders.toReversed() : trades.toReversed();

  return (
    <section
      className={`study-market-history${standalone ? " panel study-section study-history-panel" : ""}`}
      aria-label="市場の注文・約定履歴"
    >
      <div className="study-history-heading">
        <div
          className="study-history-switch"
          role="group"
          aria-label="表示する履歴"
        >
          {(["orders", "trades"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              aria-controls={panelId}
              onClick={() => {
                setMode(value);
                list.current?.scrollTo({ top: 0 });
              }}
            >
              {value === "orders" ? "注文履歴" : "歩み値"}
            </button>
          ))}
        </div>
        <div className="study-history-pages">
          <span>{newestFirst.length}件</span>
          <button
            type="button"
            className="text-button"
            disabled={!newestFirst.length}
            onClick={() => list.current?.scrollTo({ top: 0 })}
          >
            最新
          </button>
        </div>
      </div>
      <p className="study-history-caption">
        {showOrders
          ? "本市場のCDA・全期間。終了済みの注文は取引できません。新しい順・下へスクロールで過去の記録。"
          : "本市場の全期間の約定記録。新しい順・下へスクロールで過去の記録。"}
      </p>
      <div
        id={panelId}
        ref={list}
        tabIndex={0}
        role="region"
        aria-label={`${label}の一覧・スクロールで全件表示`}
        className={`study-tape-rows${showOrders ? " study-quote-history" : ""}`}
      >
        <table
          aria-label={`本市場の${showOrders ? "終了した注文履歴" : "約定履歴"}・全期間・新しい順`}
        >
          <thead>
            <tr>
              <th scope="col">
                {showOrders
                  ? showParticipants
                    ? "期・参加者"
                    : "期・売買"
                  : "期・制度"}
              </th>
              <th scope="col">{showOrders ? "終了時刻" : "時刻"}</th>
              <th scope="col">
                {showOrders ? "注文値（円）" : "約定値（円）"}
              </th>
              <th scope="col">{showOrders ? "状態" : "数量"}</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((trade) =>
              "closedAt" in trade ? (
                <tr
                  key={trade.id}
                  className={`study-ended-order${trade.participantId === participantId ? " study-own-order" : ""}`}
                >
                  <td>
                    第{trade.round}期
                    <small
                      className={
                        trade.side === "buyer" ? "buy-text" : "sell-text"
                      }
                    >
                      {showParticipants
                        ? trade.alias
                        : trade.side === "buyer"
                          ? "買い"
                          : "売り"}
                    </small>
                    {trade.participantId === participantId && (
                      <span className="study-own-order-tag">あなた</span>
                    )}
                  </td>
                  <td
                    title={`提示 ${timeLabel(trade.at)} → 終了 ${timeLabel(trade.closedAt)}`}
                  >
                    {timeLabel(trade.closedAt)}
                  </td>
                  <td>{decimal(trade.price)}</td>
                  <td>
                    <span className="study-order-status">
                      {ORDER_STATUS[trade.status]}
                    </span>
                  </td>
                </tr>
              ) : (
                <tr key={trade.id}>
                  <td>
                    第{trade.round}期
                    <small>{INSTITUTIONS[trade.institution].short}</small>
                  </td>
                  <td>{timeLabel(trade.at)}</td>
                  <td>{decimal(trade.price)}</td>
                  <td>1</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {!newestFirst.length && (
          <p className="study-empty">
            {showOrders
              ? "終了した注文はまだありません。"
              : "まだ約定はありません。"}
          </p>
        )}
      </div>
    </section>
  );
}
