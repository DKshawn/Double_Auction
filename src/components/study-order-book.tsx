"use client";

import { useState } from "react";
import { ChartBar, List } from "lucide-react";
import { studyMarketSize } from "@/lib/study-config";
import { studyPriceLevels, type StudyPriceLevel } from "@/lib/study-order-book";
import type { StudyMarketView, StudyOrder } from "@/lib/study-types";
import type { RoomView } from "@/lib/types";
import { StudyMarketHistory } from "./study-market-history";

type BookSide = {
  side: StudyOrder["side"];
  label: string;
  rows: StudyPriceLevel[];
};

export function StudyOrderBook({
  view,
  market,
}: {
  view: RoomView;
  market: StudyMarketView;
}) {
  const [display, setDisplay] = useState<"list" | "chart">("list");
  const teacher = view.me.role === "teacher";
  const sides: BookSide[] = [
    {
      side: "buyer",
      label: "買い注文",
      rows: studyPriceLevels(market.orders, "buyer", view.me.id),
    },
    {
      side: "seller",
      label: "売り注文",
      rows: studyPriceLevels(market.orders, "seller", view.me.id),
    },
  ];
  const slots = Math.min(8, studyMarketSize(view.config) / 2);
  // A shared scale keeps equal quantities equally long on both sides.
  const maximum = Math.max(
    4,
    ...sides.flatMap(({ rows }) => rows.map((r) => r.quantity)),
  );
  return (
    <section className="panel study-section study-order-book">
      <div className="study-book-heading">
        <h2>注文板</h2>
        <div
          className="study-book-display"
          role="group"
          aria-label="注文板の表示方法"
        >
          <button
            type="button"
            aria-pressed={display === "list"}
            onClick={() => setDisplay("list")}
          >
            <List size={14} aria-hidden="true" /> 一覧
          </button>
          <button
            type="button"
            aria-pressed={display === "chart"}
            onClick={() => setDisplay("chart")}
          >
            <ChartBar size={14} aria-hidden="true" /> 棒グラフ
          </button>
        </div>
      </div>
      {display === "chart" ? (
        <StudyBookChart sides={sides} slots={slots} maximum={maximum} />
      ) : (
        <div className="study-book">
          {sides.map(({ side, label, rows }) => (
            <div key={side}>
              <h3 className={side === "buyer" ? "buy-text" : "sell-text"}>
                {label}
              </h3>
              <div
                className="study-book-rows"
                role="region"
                aria-label={`${label}一覧`}
              >
                <table>
                  <thead>
                    <tr>
                      <th>価格（円）</th>
                      <th>数量</th>
                      {teacher && <th>参加者</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.price}
                        className={
                          row.ownQuantity ? "study-own-order" : undefined
                        }
                      >
                        <td>
                          {row.price}
                          {row.ownQuantity > 0 && (
                            <span
                              className="study-own-order-tag"
                              title={`あなたの注文${row.ownQuantity}単位を含みます`}
                            >
                              あなた含む
                            </span>
                          )}
                        </td>
                        <td>{row.quantity}</td>
                        {teacher && <td>{row.aliases}</td>}
                      </tr>
                    ))}
                    {Array.from(
                      { length: Math.max(0, slots - rows.length) },
                      (_, i) => (
                        <tr
                          key={`empty-${i}`}
                          className="study-book-placeholder"
                          aria-hidden="true"
                        >
                          <td>—</td>
                          <td>—</td>
                          {teacher && <td>—</td>}
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                {!rows.length && (
                  <p className="study-empty">まだ注文はありません</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {teacher && (
        <StudyMarketHistory
          key={market.id}
          trades={market.trades}
          orders={market.orderHistory}
          clearings={market.clearings}
          offerHistory={market.offerHistory}
          rounds={view.config.rounds}
          showParticipants
        />
      )}
    </section>
  );
}

export function StudyBookChart({
  sides,
  slots,
  maximum,
}: {
  sides: BookSide[];
  slots: number;
  maximum: number;
}) {
  const buyers = new Map(
    sides
      .find(({ side }) => side === "buyer")
      ?.rows.map((row) => [row.price, row]),
  );
  const sellers = new Map(
    sides
      .find(({ side }) => side === "seller")
      ?.rows.map((row) => [row.price, row]),
  );
  const prices = [...new Set([...buyers.keys(), ...sellers.keys()])].sort(
    (a, b) => b - a,
  );
  return (
    <div
      className="study-book-chart"
      role="region"
      aria-label="価格別の注文数量の棒グラフ"
    >
      <div className="study-book-chart-heading">
        <h3 className="sell-text">売り気配単位</h3>
        <span className="study-book-chart-price-header">気配値</span>
        <h3 className="buy-text">買い気配単位</h3>
      </div>
      <div
        className="study-book-chart-rows"
        style={{ minHeight: `${slots * 24}px` }}
      >
        <ol aria-label="価格別の買い注文と売り注文">
          {prices.map((price) => {
            const buyer = buyers.get(price);
            const seller = sellers.get(price);
            const ownQuantity =
              (buyer?.ownQuantity ?? 0) + (seller?.ownQuantity ?? 0);
            return (
              <li key={price}>
                <div
                  className="study-book-chart-row"
                  role="img"
                  aria-label={`${price}円、買い${buyer?.quantity ?? 0}単位、売り${seller?.quantity ?? 0}単位${ownQuantity ? `、あなたの注文${ownQuantity}単位を含む` : ""}`}
                >
                  <StudyBookChartBar
                    side="seller"
                    level={seller}
                    maximum={maximum}
                  />
                  <span className="study-book-chart-price">
                    {price}
                    {ownQuantity > 0 && (
                      <span
                        className="study-book-chart-own-dot"
                        aria-hidden="true"
                        title="あなたの注文を含む"
                      >
                        ●
                      </span>
                    )}
                  </span>
                  <StudyBookChartBar
                    side="buyer"
                    level={buyer}
                    maximum={maximum}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        {!prices.length && (
          <p className="study-book-chart-empty">まだ注文はありません</p>
        )}
      </div>
    </div>
  );
}

function StudyBookChartBar({
  side,
  level,
  maximum,
}: {
  side: StudyOrder["side"];
  level: StudyPriceLevel | undefined;
  maximum: number;
}) {
  return (
    <span
      className={`study-book-chart-side ${side} ${level?.ownQuantity ? "study-book-chart-own" : ""}`}
      aria-hidden="true"
    >
      <span className="study-book-chart-track">
        {level && (
          <span
            className="study-book-chart-bar"
            style={{ width: `${(level.quantity / maximum) * 100}%` }}
          />
        )}
      </span>
      <b className="study-book-chart-quantity">{level?.quantity ?? "—"}</b>
    </span>
  );
}
