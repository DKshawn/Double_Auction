"use client";

import { useRef, useState } from "react";
import { decimal, timeLabel } from "@/lib/client";
import { INSTITUTIONS } from "@/lib/study-rules";
import type {
  Institution,
  StudyMarketView,
  StudyOrderHistory,
} from "@/lib/study-types";

const ORDER_STATUS: Record<StudyOrderHistory["status"], string> = {
  replaced: "変更済み",
  cancelled: "取消済み",
  filled: "約定済み",
  expired: "期終了",
  interrupted: "中断終了",
};

type HistoryEntry = {
  id: string;
  at: number;
  sequence: number;
} & (
  | { kind: "order"; order: StudyOrderHistory }
  | { kind: "trade"; trade: StudyMarketView["trades"][number] }
);

function historyEntries(
  orders: StudyMarketView["orderHistory"],
  trades: StudyMarketView["trades"],
): HistoryEntry[] {
  const unitKey = (round: number, participant: string, unit: number) =>
    `${round}/${participant}/${unit}`;
  const tradedUnits = new Set(
    trades
      .filter((trade) => trade.institution === "cda")
      .flatMap((trade) => [
        unitKey(trade.round, trade.buyerId, trade.buyerUnit),
        unitKey(trade.round, trade.sellerId, trade.sellerUnit),
      ]),
  );
  // A filled resting order and its trade describe the same execution. Keep
  // the trade once, but retain any historical order without a matching trade.
  const entries: HistoryEntry[] = [
    ...orders
      .filter(
        (order) =>
          order.status !== "filled" ||
          !tradedUnits.has(
            unitKey(order.round, order.participantId, order.unit),
          ),
      )
      .map((order) => ({
        kind: "order" as const,
        id: `order-${order.id}`,
        at: order.closedAt,
        sequence: order.closedSequence,
        order,
      })),
    ...trades.map((trade) => ({
      kind: "trade" as const,
      id: `trade-${trade.id}`,
      at: trade.at,
      sequence: trade.sequence,
      trade,
    })),
  ];
  return entries.sort((a, b) => b.at - a.at || b.sequence - a.sequence);
}

export function StudyMarketHistory({
  trades,
  orders,
  participantId,
  showParticipants = false,
  standalone = false,
  institution,
}: {
  trades: StudyMarketView["trades"];
  orders: StudyMarketView["orderHistory"];
  participantId?: string;
  showParticipants?: boolean;
  standalone?: boolean;
  institution?: Institution;
}) {
  const list = useRef<HTMLDivElement>(null);
  const newestFirst = historyEntries(orders, trades);
  // Existing history must not flash on entry. Remember completed highlights so
  // polling, scrolling and reopening the teacher dialog do not replay them.
  const [seenIds, setSeenIds] = useState(
    () => new Set(newestFirst.map((entry) => entry.id)),
  );
  const finishHighlight = (id: string) =>
    setSeenIds((previous) =>
      previous.has(id) ? previous : new Set(previous).add(id),
    );
  const latest = newestFirst[0];
  const scopeLabel = institution
    ? `${INSTITUTIONS[institution].short}・制度内1〜5期`
    : "全15期";

  return (
    <section
      className={`study-market-history${standalone ? " panel study-section study-history-panel" : ""}`}
      aria-label="市場の注文・約定履歴"
    >
      <div className="study-history-heading">
        <h3>注文履歴・歩み値</h3>
        <div className="study-history-pages">
          <span
            key={latest?.id ?? "empty"}
            className={
              latest && !seenIds.has(latest.id)
                ? "study-history-count study-history-new"
                : "study-history-count"
            }
            onAnimationEnd={() => latest && finishHighlight(latest.id)}
          >
            {newestFirst.length}件
          </span>
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
        本市場・{scopeLabel}
        ・新しい順。約定済み注文は歩み値に統合。終了した注文は取引できません。
      </p>
      <div
        ref={list}
        tabIndex={0}
        role="region"
        aria-label="注文履歴・歩み値の一覧・スクロールで全件表示"
        className="study-tape-rows"
      >
        <table aria-label={`本市場の注文履歴・歩み値・${scopeLabel}・新しい順`}>
          <thead>
            <tr>
              <th scope="col">{institution ? "制度内の期" : "期・制度"}</th>
              <th scope="col">時刻</th>
              <th scope="col">種別</th>
              <th scope="col">価格（円）</th>
              <th scope="col">状態・数量</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((entry) => {
              const order = entry.kind === "order" ? entry.order : null;
              const trade = entry.kind === "trade" ? entry.trade : null;
              const own = order
                ? order.participantId === participantId
                : trade!.buyerId === participantId ||
                  trade!.sellerId === participantId;
              return (
                <tr
                  key={entry.id}
                  className={[
                    order ? "study-ended-order" : "study-history-trade",
                    own ? "study-own-order" : "",
                    !seenIds.has(entry.id) ? "study-history-new" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onAnimationEnd={() => finishHighlight(entry.id)}
                >
                  <td title={`全体の第${order?.round ?? trade!.round}期`}>
                    第
                    {institution
                      ? (((order?.round ?? trade!.round) - 1) % 5) + 1
                      : (order?.round ?? trade!.round)}
                    期
                    <small>
                      {INSTITUTIONS[trade?.institution ?? "cda"].short}
                    </small>
                  </td>
                  <td
                    title={
                      order
                        ? `提示 ${timeLabel(order.at)} → 終了 ${timeLabel(entry.at)}`
                        : `約定 ${timeLabel(entry.at)}`
                    }
                  >
                    {timeLabel(entry.at)}
                  </td>
                  <td className="study-history-kind">
                    <span
                      className={
                        order
                          ? order.side === "buyer"
                            ? "buy-text"
                            : "sell-text"
                          : "study-trade-kind"
                      }
                    >
                      {order
                        ? order.side === "buyer"
                          ? "買い注文"
                          : "売り注文"
                        : "約定"}
                    </span>
                    {own && <span className="study-own-order-tag">あなた</span>}
                    {showParticipants && (
                      <small className="study-history-participants">
                        {order
                          ? order.alias
                          : `${trade!.buyerAlias}・${trade!.sellerAlias}`}
                      </small>
                    )}
                  </td>
                  <td>{decimal(order?.price ?? trade!.price)}</td>
                  <td>
                    {order ? (
                      <span className="study-order-status">
                        {ORDER_STATUS[order.status]}
                      </span>
                    ) : (
                      "1単位"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!newestFirst.length && (
          <p className="study-empty">まだ注文履歴・約定はありません。</p>
        )}
      </div>
    </section>
  );
}
