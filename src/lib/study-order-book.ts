import type { StudyOrder } from "./study-types";

export type StudyPriceLevel = {
  price: number;
  quantity: number;
  ownQuantity: number;
  aliases: string;
};

export function studyPriceLevels(
  orders: readonly StudyOrder[],
  side: StudyOrder["side"],
  participantId: string,
): StudyPriceLevel[] {
  const sorted = orders
    .filter((order) => order.side === side)
    .sort(
      (a, b) =>
        (side === "buyer" ? b.price - a.price : a.price - b.price) ||
        a.sequence - b.sequence,
    );
  const levels = new Map<number, StudyPriceLevel>();
  // Each active CDA order represents one unit. Aggregate only its display.
  for (const order of sorted) {
    const level = levels.get(order.price);
    const ownQuantity = Number(order.participantId === participantId);
    if (level) {
      level.quantity += 1;
      level.ownQuantity += ownQuantity;
      level.aliases += `・${order.alias}`;
    } else {
      levels.set(order.price, {
        price: order.price,
        quantity: 1,
        ownQuantity,
        aliases: order.alias,
      });
    }
  }
  return Array.from(levels.values());
}
