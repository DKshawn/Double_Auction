"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { decimal, timeLabel } from "@/lib/client";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { StudyMarketView } from "@/lib/study-types";

const ROWS = 3;

export function StudyMarketHistory({
  trades,
}: {
  trades: StudyMarketView["trades"];
}) {
  // Anchor older records to a confirmed trade so new fills do not move the
  // records someone is reading. The latest view follows incoming fills.
  const [anchor, setAnchor] = useState<string | null>(null);
  const newestFirst = trades.toReversed();
  const start = anchor
    ? Math.max(
        0,
        newestFirst.findIndex((trade) => trade.id === anchor),
      )
    : 0;
  const rows = newestFirst.slice(start, start + ROWS);

  return (
    <section className="study-market-history" aria-label="歩み値（約定履歴）">
      <div className="study-history-heading">
        <h3>歩み値（約定履歴）</h3>
        <nav className="study-history-pages" aria-label="歩み値の表示範囲">
          <button
            type="button"
            className="text-button"
            disabled={start === 0}
            onClick={() => setAnchor(null)}
          >
            最新
          </button>
          <button
            type="button"
            className="text-button"
            aria-label="新しい約定を表示"
            disabled={start === 0}
            onClick={() =>
              setAnchor(start <= ROWS ? null : newestFirst[start - ROWS].id)
            }
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {rows.length ? `${start + 1}–${start + rows.length}` : "0"}/
            {trades.length}件
          </span>
          <button
            type="button"
            className="text-button"
            aria-label="古い約定を表示"
            disabled={start + ROWS >= trades.length}
            onClick={() => setAnchor(newestFirst[start + ROWS].id)}
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      </div>
      <div className="study-tape-rows">
        <table aria-label="本市場の約定履歴・全期間・新しい順">
          <thead>
            <tr>
              <th scope="col">期・制度</th>
              <th scope="col">時刻</th>
              <th scope="col">約定値（円）</th>
              <th scope="col">数量</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((trade) => (
              <tr key={trade.id}>
                <td>
                  第{trade.round}期
                  <small>{INSTITUTIONS[trade.institution].short}</small>
                </td>
                <td>{timeLabel(trade.at)}</td>
                <td>{decimal(trade.price)}</td>
                <td>1</td>
              </tr>
            ))}
            {Array.from({ length: ROWS - rows.length }, (_, i) => (
              <tr
                key={`empty-${i}`}
                className="study-book-placeholder"
                aria-hidden="true"
              >
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="study-empty">まだ約定はありません。</p>}
      </div>
    </section>
  );
}
