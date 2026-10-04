"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { decimal } from "@/lib/client";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { StudyView } from "@/lib/study-types";

type PersonalTrade = StudyView["myTrades"][number];

export function StudyTradeFeedback({
  trades,
  buyer,
}: {
  trades: PersonalTrade[];
  buyer: boolean;
}) {
  // The initial snapshot is history, not a new fill. Compare confirmed IDs so
  // polling, command retries and trades initiated by the counterparty behave alike.
  const [previous, setPrevious] = useState(trades);
  const [notification, setNotification] = useState<PersonalTrade[]>([]);
  if (previous !== trades) {
    setPrevious(trades);
    const seen = new Set(previous.map((trade) => trade.id));
    const added = trades.filter((trade) => !seen.has(trade.id));
    if (added.length) setNotification(added);
  }

  return (
    <div
      className="study-trade-feedback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {notification.length > 0 && (
        <TradeNotice
          key={notification.at(-1)!.id}
          trades={notification}
          buyer={buyer}
        />
      )}
    </div>
  );
}

function TradeNotice({
  trades,
  buyer,
}: {
  trades: PersonalTrade[];
  buyer: boolean;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  const prices = [...new Set(trades.map((trade) => trade.price))];
  const profit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  return (
    <div className="study-trade-notice">
      <CheckCircle2 size={22} aria-hidden="true" />
      <div>
        <b>取引が成立しました</b>
        <p>
          {trades.length}単位を
          {prices.map((price) => `${decimal(price)} 円`).join("・")}で
          {buyer ? "購入" : "販売"}
          <span className={profit < 0 ? "loss" : ""}>
            利益 {decimal(profit)} 円{profit < 0 ? "（損失）" : ""}
          </span>
        </p>
      </div>
      <button
        type="button"
        className="text-button"
        aria-label="取引通知を閉じる"
        onClick={() => setVisible(false)}
      >
        <X size={18} />
      </button>
    </div>
  );
}

export function StudyPersonalHistory({ trades }: { trades: PersonalTrade[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(trades.length / 2));
  const current = Math.min(page, pages - 1);
  const rows = trades.toReversed().slice(current * 2, current * 2 + 2);
  return (
    <section className="study-personal-history" aria-label="あなたの取引履歴">
      <div className="study-history-heading">
        <h3>あなたの取引履歴（{trades.length}件）</h3>
        {pages > 1 && (
          <nav className="study-history-pages" aria-label="取引履歴のページ">
            <button
              type="button"
              className="text-button"
              aria-label="新しい取引を表示"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {current + 1}/{pages}
            </span>
            <button
              type="button"
              className="text-button"
              aria-label="古い取引を表示"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </nav>
        )}
      </div>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              <th>制度内の期</th>
              <th>単位</th>
              <th>価格（円）</th>
              <th>利益（円）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((trade) => (
              <tr key={trade.id}>
                <td title={`全体の第${trade.round}期`}>
                  第{((trade.round - 1) % 5) + 1}期
                  <small>{INSTITUTIONS[trade.institution].short}</small>
                </td>
                <td>{trade.unit}</td>
                <td>{decimal(trade.price)}</td>
                <td className={trade.profit < 0 ? "loss" : "profit"}>
                  {decimal(trade.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">まだ取引はありません。</p>
      )}
    </section>
  );
}
