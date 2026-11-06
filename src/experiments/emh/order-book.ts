import { groupOrderBookLevels } from "@/lib/order-book";
import type { Quote, Room, Side } from "./types";

export function canSellAtMarket(holdings: number, hasStandingAsk: boolean) {
  return holdings > Number(hasStandingAsk);
}

export function standingQuotes(room: Room, side: Side): Quote[] {
  const first = room[side];
  return first ? [first, ...(room.queuedQuotes?.[side] ?? [])] : [];
}

/** Repricing joins the end of its new price level, including same-millisecond arrivals. */
export function updateStandingQuote(
  room: Room,
  side: Side,
  owner: string,
  replacement?: Quote,
) {
  const orders = standingQuotes(room, side).filter(
    (quote) => quote.participantId !== owner,
  );
  if (replacement) {
    const lowerPriority = orders.findIndex((quote) =>
      side === "bid"
        ? quote.price < replacement.price
        : quote.price > replacement.price,
    );
    orders.splice(
      lowerPriority < 0 ? orders.length : lowerPriority,
      0,
      replacement,
    );
  }
  room[side] = orders.shift() ?? null;
  (room.queuedQuotes ??= { bid: [], ask: [] })[side] = orders;
}

export function visiblePriceLevels(
  quotes: Quote[],
  teacher: boolean,
  owner?: string,
) {
  return groupOrderBookLevels(
    quotes.map((quote) => ({
      price: quote.price,
      participantId: quote.participantId,
      alias: teacher ? `被験者 #${quote.seat}` : "",
    })),
    owner,
  );
}
