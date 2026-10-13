import type { StudyOrder } from "./study-types";

export type StudyPriceLevel = {
  price: number;
  quantity: number;
  ownQuantity: number;
  aliases: string;
};

export const STUDY_BOOK_ROW_HEIGHT = 24;
export const MIN_STUDY_BOOK_ROWS = 4;

type StudyBookQuantity = Pick<StudyPriceLevel, "quantity" | "ownQuantity">;
export type StudyBookChartRow = {
  kind: "price" | "above" | "below";
  price: number;
  buyer?: StudyBookQuantity;
  seller?: StudyBookQuantity;
};

export function studyBookRowCapacity(height: number) {
  return Math.max(
    MIN_STUDY_BOOK_ROWS,
    Math.floor(height / STUDY_BOOK_ROW_HEIGHT),
  );
}

/** Keep the best bid/ask visible and fold distant prices into disjoint tails. */
export function studyBookChartRows(
  buyerLevels: readonly StudyPriceLevel[],
  sellerLevels: readonly StudyPriceLevel[],
  capacity: number,
): StudyBookChartRow[] {
  const buyers = new Map(buyerLevels.map((row) => [row.price, row]));
  const sellers = new Map(sellerLevels.map((row) => [row.price, row]));
  const prices = [...new Set([...buyers.keys(), ...sellers.keys()])].sort(
    (a, b) => b - a,
  );
  const limit = Math.max(MIN_STUDY_BOOK_ROWS, Math.floor(capacity));
  const detail = (price: number): StudyBookChartRow => ({
    kind: "price",
    price,
    buyer: buyers.get(price),
    seller: sellers.get(price),
  });
  if (prices.length <= limit) return prices.map(detail);

  const bestPrices = [
    ...(buyers.size ? [Math.max(...buyers.keys())] : []),
    ...(sellers.size ? [Math.min(...sellers.keys())] : []),
  ];
  const center =
    bestPrices.reduce((sum, price) => sum + prices.indexOf(price), 0) /
    bestPrices.length;
  const count = limit - 2;
  let start = Math.max(
    0,
    Math.min(prices.length - count, Math.floor(center - (count - 1) / 2)),
  );
  let end = start + count;
  // At either edge, the missing summary row becomes another detailed price.
  if (start === 0) end = limit - 1;
  else if (end === prices.length) start = prices.length - (limit - 1);

  const sum = (
    levels: Map<number, StudyPriceLevel>,
    tail: readonly number[],
  ): StudyBookQuantity => {
    const total = { quantity: 0, ownQuantity: 0 };
    for (const price of tail) {
      const level = levels.get(price);
      total.quantity += level?.quantity ?? 0;
      total.ownQuantity += level?.ownQuantity ?? 0;
    }
    return total;
  };
  const summary = (
    kind: "above" | "below",
    price: number,
    tail: readonly number[],
  ): StudyBookChartRow => ({
    kind,
    price,
    buyer: sum(buyers, tail),
    seller: sum(sellers, tail),
  });
  return [
    ...(start > 0
      ? [summary("above", prices[start], prices.slice(0, start))]
      : []),
    ...prices.slice(start, end).map(detail),
    ...(end < prices.length
      ? [summary("below", prices[end - 1], prices.slice(end))]
      : []),
  ];
}

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
