"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChartBar, List } from "lucide-react";
import { OrderBookList } from "./order-book-list";
import {
  MIN_ORDER_BOOK_ROWS,
  ORDER_BOOK_ROW_HEIGHT,
  orderBookChartRows,
  orderBookRowCapacity,
  type OrderBookLevel,
  type OrderBookSide,
} from "@/lib/order-book";

export function OrderBookPanel({
  sides,
  title = "注文板",
  minimumRows = 8,
  showParticipants = false,
  quantityLabel,
  className = "",
  children,
  footer,
}: {
  sides: OrderBookSide[];
  title?: string;
  minimumRows?: number;
  showParticipants?: boolean;
  quantityLabel?: string;
  className?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const [display, setDisplay] = useState<"list" | "chart">("list");
  const maximum = Math.max(
    4,
    ...sides.flatMap(({ rows }) => rows.map((row) => row.quantity)),
  );
  return (
    <section
      className={["panel study-section study-order-book", className]
        .filter(Boolean)
        .join(" ")}
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
            data-audit-button="order-book.list"
            onClick={() => setDisplay("list")}
          >
            <List size={14} aria-hidden="true" /> 一覧
          </button>
          <button
            type="button"
            aria-pressed={display === "chart"}
            data-audit-button="order-book.chart"
            onClick={() => setDisplay("chart")}
          >
            <ChartBar size={14} aria-hidden="true" /> 棒グラフ
          </button>
        </div>
      </div>
      {children}
      {display === "chart" ? (
        <OrderBookChart sides={sides} slots={minimumRows} maximum={maximum} />
      ) : (
        <OrderBookList
          sides={sides}
          minimumRows={minimumRows}
          showParticipants={showParticipants}
          quantityLabel={quantityLabel}
        />
      )}
      {footer}
    </section>
  );
}

export function OrderBookChart({
  sides,
  slots,
  maximum,
}: {
  sides: OrderBookSide[];
  slots: number;
  maximum: number;
}) {
  const rowArea = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(
    Math.max(MIN_ORDER_BOOK_ROWS, slots),
  );
  useEffect(() => {
    const element = rowArea.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = orderBookRowCapacity(entry.contentRect.height);
      setCapacity((previous) => (previous === next ? previous : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const rows = orderBookChartRows(
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
          "--book-chart-row-height": `${ORDER_BOOK_ROW_HEIGHT}px`,
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
            const displayPrice =
              kind === "above" ? "Over" : kind === "below" ? "Under" : price;
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
                  <OrderBookChartBar
                    side="seller"
                    level={seller}
                    maximum={scaleMaximum}
                  />
                  <span className="study-book-chart-price">
                    {displayPrice}
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
                  <OrderBookChartBar
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

function OrderBookChartBar({
  side,
  level,
  maximum,
}: {
  side: OrderBookSide["side"];
  level: Pick<OrderBookLevel, "quantity" | "ownQuantity"> | undefined;
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
      <b className="study-book-chart-quantity">{level?.quantity || "—"}</b>
    </span>
  );
}
