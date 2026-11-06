export type OrderBookLevel = {
  price: number;
  quantity: number;
  ownQuantity: number;
  aliases: string;
};

export type OrderBookSide = {
  side: "buyer" | "seller";
  label: string;
  rows: OrderBookLevel[];
};

/** Aggregate one-unit orders already sorted in matching order. */
export function groupOrderBookLevels(
  orders: readonly { price: number; participantId: string; alias: string }[],
  participantId?: string,
): OrderBookLevel[] {
  const levels = new Map<number, OrderBookLevel>();
  for (const order of orders) {
    const level = levels.get(order.price);
    const ownQuantity = Number(order.participantId === participantId);
    if (level) {
      level.quantity++;
      level.ownQuantity += ownQuantity;
      if (order.alias) level.aliases += `・${order.alias}`;
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

export const ORDER_BOOK_ROW_HEIGHT = 24;
export const MIN_ORDER_BOOK_ROWS = 4;

type BookQuantity = Pick<OrderBookLevel, "quantity" | "ownQuantity">;
export type BookChartRow = {
  kind: "price" | "above" | "below";
  price: number;
  buyer?: BookQuantity;
  seller?: BookQuantity;
};

export function orderBookRowCapacity(height: number) {
  return Math.max(
    MIN_ORDER_BOOK_ROWS,
    Math.floor(height / ORDER_BOOK_ROW_HEIGHT),
  );
}

/** Keep the best bid/ask visible and fold distant prices into disjoint tails. */
export function orderBookChartRows(
  buyerLevels: readonly OrderBookLevel[],
  sellerLevels: readonly OrderBookLevel[],
  capacity: number,
): BookChartRow[] {
  const buyers = new Map(buyerLevels.map((row) => [row.price, row]));
  const sellers = new Map(sellerLevels.map((row) => [row.price, row]));
  const prices = [...new Set([...buyers.keys(), ...sellers.keys()])].sort(
    (a, b) => b - a,
  );
  const limit = Math.max(MIN_ORDER_BOOK_ROWS, Math.floor(capacity));
  const detail = (price: number): BookChartRow => ({
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
    levels: Map<number, OrderBookLevel>,
    tail: readonly number[],
  ): BookQuantity => {
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
  ): BookChartRow => ({
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
