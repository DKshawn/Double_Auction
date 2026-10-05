"use client";

import { useRef, useState } from "react";
import { decimal, timeLabel } from "@/lib/client";
import { INSTITUTIONS } from "@/lib/study-rules";
import type {
  Clearing,
  Institution,
  PostedOfferHistory,
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
  | { kind: "offer"; offer: PostedOfferHistory }
  | { kind: "clearing"; clearing: Clearing }
);

function historyEntries(
  orders: StudyMarketView["orderHistory"],
  trades: StudyMarketView["trades"],
  clearings: Clearing[],
  offerHistory: PostedOfferHistory[],
): HistoryEntry[] {
  const clearingKeys = new Set(clearings.map((c) => `${c.round}/${c.call}`));
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
    // A Call clearing already includes every unit traded at its common price.
    // Keep zero-volume clearings too, so the fourth result survives a new period.
    ...trades
      .filter(
        (trade) =>
          trade.institution !== "call" ||
          !clearingKeys.has(`${trade.round}/${trade.call}`),
      )
      .map((trade) => ({
        kind: "trade" as const,
        id: `trade-${trade.id}`,
        at: trade.at,
        sequence: trade.sequence,
        trade,
      })),
    ...clearings.map((clearing) => ({
      kind: "clearing" as const,
      id: `clearing-${clearing.round}-${clearing.call}`,
      at: clearing.at,
      sequence: 0,
      clearing,
    })),
    ...offerHistory.map((offer) => ({
      kind: "offer" as const,
      id: `offer-${offer.id}`,
      at: offer.at,
      sequence: offer.sequence,
      offer,
    })),
  ];
  return entries.sort((a, b) => b.at - a.at || b.sequence - a.sequence);
}

export function StudyMarketHistory({
  trades,
  orders,
  clearings = EMPTY_CLEARINGS,
  offerHistory = EMPTY_OFFERS,
  participantId,
  showParticipants = false,
  standalone = false,
  institution,
}: {
  trades: StudyMarketView["trades"];
  orders: StudyMarketView["orderHistory"];
  clearings?: Clearing[];
  offerHistory?: PostedOfferHistory[];
  participantId?: string;
  showParticipants?: boolean;
  standalone?: boolean;
  institution?: Institution;
}) {
  const list = useRef<HTMLDivElement>(null);
  const newestFirst = historyEntries(orders, trades, clearings, offerHistory);
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
        本市場・{institution === "posted" ? "制度内1〜5期" : scopeLabel}
        {institution === "call"
          ? "・新しい順。各回の清算価格と約定数量を表示します。個別の注文価格は公開しません。"
          : institution === "posted"
            ? "・新しい順。提示数量は価格公開時の数量です。"
            : institution === "cda"
              ? "・新しい順。終了した注文は取引できません。"
              : "・新しい順。約定済み注文は歩み値に統合。終了した注文は取引できません。"}
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
              <th scope="col">{institution === "call" ? "清算回" : "種別"}</th>
              <th scope="col">価格（円）</th>
              <th scope="col">
                {institution === "call" ? "約定数量" : "状態・数量"}
              </th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((entry) => {
              if (entry.kind === "clearing") {
                const clearing = entry.clearing;
                return (
                  <tr
                    key={entry.id}
                    className={[
                      clearing.quantity
                        ? "study-history-trade"
                        : "study-ended-order",
                      !seenIds.has(entry.id) ? "study-history-new" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onAnimationEnd={() => finishHighlight(entry.id)}
                  >
                    <td title={`全体の第${clearing.round}期`}>
                      第
                      {institution
                        ? ((clearing.round - 1) % 5) + 1
                        : clearing.round}
                      期{!institution && <small>Call Market</small>}
                    </td>
                    <td title={`清算 ${timeLabel(entry.at)}`}>
                      {timeLabel(entry.at)}
                    </td>
                    <td className="study-history-kind">第{clearing.call}回</td>
                    <td>
                      {clearing.price === null
                        ? "成立なし"
                        : decimal(clearing.price)}
                    </td>
                    <td>{clearing.quantity}単位</td>
                  </tr>
                );
              }
              if (entry.kind === "offer") {
                const offer = entry.offer;
                return (
                  <tr
                    key={entry.id}
                    className={[
                      offer.participantId === participantId
                        ? "study-own-order"
                        : "",
                      !seenIds.has(entry.id) ? "study-history-new" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onAnimationEnd={() => finishHighlight(entry.id)}
                  >
                    <td title={`全体の第${offer.round}期`}>
                      第
                      {institution ? ((offer.round - 1) % 5) + 1 : offer.round}
                      期{!institution && <small>Posted Offer</small>}
                    </td>
                    <td title={`価格公開 ${timeLabel(entry.at)}`}>
                      {timeLabel(entry.at)}
                    </td>
                    <td className="study-history-kind">
                      <span className="sell-text">価格提示</span>
                      {offer.participantId === participantId && (
                        <span className="study-own-order-tag">あなた</span>
                      )}
                      {showParticipants && (
                        <small className="study-history-participants">
                          {offer.alias}
                        </small>
                      )}
                    </td>
                    <td>{decimal(offer.price)}</td>
                    <td>{offer.quantity}単位</td>
                  </tr>
                );
              }
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
                    {!institution && (
                      <small>
                        {INSTITUTIONS[trade?.institution ?? "cda"].short}
                      </small>
                    )}
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
          <p className="study-empty">
            {institution === "call"
              ? "締切後に清算結果が表示されます。"
              : institution === "posted"
                ? "まだ価格提示・約定はありません。"
                : "まだ注文履歴・約定はありません。"}
          </p>
        )}
      </div>
    </section>
  );
}

const EMPTY_CLEARINGS: Clearing[] = [];
const EMPTY_OFFERS: PostedOfferHistory[] = [];
