"use client";

import type { ReactNode } from "react";
import { OrderBookPanel } from "@/components/order-book-panel";
import type { OrderBookSide } from "@/lib/order-book";
import { studyMarketCounts } from "@/experiments/double-auction/lib/study-config";
import { studyPriceLevels } from "@/experiments/double-auction/lib/study-order-book";
import type { StudyMarketView } from "@/experiments/double-auction/lib/study-types";
import type { RoomView } from "@/experiments/double-auction/lib/types";
import { StudyMarketHistory } from "./study-market-history";

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
  const teacher = view.me.role === "teacher";
  const sides: OrderBookSide[] = [
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
  return (
    <OrderBookPanel
      sides={sides}
      title={title}
      minimumRows={slots}
      showParticipants={teacher}
      className={
        market.institution === "call"
          ? "study-call-book"
          : market.institution === "cda" && !teacher
            ? "cda-order-book"
            : undefined
      }
      quantityLabel={market.institution === "call" ? "残数量" : "数量"}
      footer={
        teacher && (
          <StudyMarketHistory
            key={market.id}
            trades={market.trades}
            orders={market.orderHistory}
            clearings={market.clearings}
            offerHistory={market.offerHistory}
            rounds={view.config.rounds}
            showParticipants
          />
        )
      }
    >
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
    </OrderBookPanel>
  );
}
