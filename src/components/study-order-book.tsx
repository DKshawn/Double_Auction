"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChartBar, List } from "lucide-react";
import { studyMarketCounts } from "@/lib/study-config";
import {
  MIN_STUDY_BOOK_ROWS,
  STUDY_BOOK_ROW_HEIGHT,
  studyBookChartRows,
  studyBookRowCapacity,
  studyPriceLevels,
  type StudyPriceLevel,
} from "@/lib/study-order-book";
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
  children,
  title = "注文板",
}: {
  view: RoomView;
  market: StudyMarketView;
  children?: ReactNode;
  title?: string;
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
  const counts = studyMarketCounts(view.config, market.id);
  const slots = Math.min(8, Math.max(counts.buyers, counts.sellers));
  // A shared scale keeps equal quantities equally long on both sides.
  const maximum = Math.max(
    4,
    ...sides.flatMap(({ rows }) => rows.map((r) => r.quantity)),
  );
  return (
    <section
      className={`panel study-section study-order-book${market.institution === "call" ? " study-call-book" : ""}`}
    >
      <div className="study-book-heading">
        <h2>{title}</h2>
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
      {children}
      {(market.institution === "call" || market.posted) && (
        <p className="study-call-best" aria-label="最良買値と最良売値">
          <span className="buy-text">
            最良買値 {sides[0].rows[0]?.price ?? "—"} 円
          </span>
          <span className="sell-text">
            最良売値 {sides[1].rows[0]?.price ?? "—"} 円
          </span>
        </p>
      )}
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
                      <th>
                        {market.institution === "call" ? "残数量" : "数量"}
                      </th>
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
  const rowArea = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(
    Math.max(MIN_STUDY_BOOK_ROWS, slots),
  );
  useEffect(() => {
    const element = rowArea.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = studyBookRowCapacity(entry.contentRect.height);
      setCapacity((previous) => (previous === next ? previous : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const rows = studyBookChartRows(
    sides.find(({ side }) => side === "buyer")?.rows ?? [],
    sides.find(({ side }) => side === "seller")?.rows ?? [],
    capacity,
  );
  const scaleMaximum = Math.max(
    maximum,
    ...rows.flatMap((row) => [
      row.buyer?.quantity ?? 0,
      row.seller?.quantity ?? 0,
    ]),
  );
  return (
    <div
      className="study-book-chart"
      role="region"
      aria-label="価格別の注文数量の棒グラフ"
      style={
        {
          "--book-chart-row-height": `${STUDY_BOOK_ROW_HEIGHT}px`,
        } as CSSProperties
      }
    >
      <div className="study-book-chart-heading">
        <h3 className="sell-text">売り気配単位</h3>
        <span className="study-book-chart-price-header">気配値</span>
        <h3 className="buy-text">買い気配単位</h3>
      </div>
      <div className="study-book-chart-rows" ref={rowArea}>
        <ol aria-label="価格別の買い注文と売り注文">
          {rows.map(({ kind, price, buyer, seller }) => {
            const ownQuantity =
              (buyer?.ownQuantity ?? 0) + (seller?.ownQuantity ?? 0);
            const range =
              kind === "above" ? "> " : kind === "below" ? "< " : "";
            const priceLabel = `${price}円${kind === "above" ? "より高い注文の合計" : kind === "below" ? "より安い注文の合計" : ""}`;
            const label = `${priceLabel}、買い${buyer?.quantity ?? 0}単位、売り${seller?.quantity ?? 0}単位${ownQuantity ? `、あなたの注文${ownQuantity}単位を含む` : ""}`;
            return (
              <li key={`${kind}-${price}`}>
                <div
                  className={`study-book-chart-row${kind !== "price" ? " study-book-chart-summary" : ""}`}
                  role="img"
                  aria-label={label}
                  title={kind === "price" ? undefined : label}
                >
                  <StudyBookChartBar
                    side="seller"
                    level={seller}
                    maximum={scaleMaximum}
                  />
                  <span className="study-book-chart-price">
                    {range}
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
                    maximum={scaleMaximum}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        {!rows.length && (
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
  level: Pick<StudyPriceLevel, "quantity" | "ownQuantity"> | undefined;
  maximum: number;
}) {
  return (
    <span
      className={`study-book-chart-side ${side} ${level?.ownQuantity ? "study-book-chart-own" : ""}`}
      aria-hidden="true"
    >
      <span className="study-book-chart-track">
        {level && level.quantity > 0 && (
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
