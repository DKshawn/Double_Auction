import { groupOrderBookLevels, type OrderBookLevel } from "@/lib/order-book";
import type { StudyOrder } from "./study-types";

export function studyPriceLevels(
  orders: readonly StudyOrder[],
  side: StudyOrder["side"],
  participantId: string,
): OrderBookLevel[] {
  const sorted = orders
    .filter((order) => order.side === side)
    .sort(
      (a, b) =>
        (side === "buyer" ? b.price - a.price : a.price - b.price) ||
        a.sequence - b.sequence,
    );
  return groupOrderBookLevels(sorted, participantId);
}
