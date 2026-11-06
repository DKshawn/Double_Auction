import type { RoomView, Side } from "./types";
import { canSellAtMarket } from "./order-book";

function remainingDividend(room: RoomView): number | null {
  if (room.exp2) {
    const { dividends, prior, clue } = room.exp2;
    if (!dividends) return null;
    // Only the student's own visible information can inform this estimate.
    if (clue !== null) return dividends[clue - 1] ?? null;
    return dividends.reduce(
      (sum, value, index) => sum + value * prior[index]!,
      0,
    );
  }
  const dividends = room.me?.dividends;
  if (!dividends) return null;
  return room.period === "A" ? dividends.a + dividends.b : dividends.b;
}

/** One-unit incremental profit versus holding to round end without further trading. */
export function orderProfitPreview(
  room: RoomView,
  side: Side,
  limitPrice: string,
) {
  const empty = { limit: null, market: null };
  const value = remainingDividend(room);
  const buying = side === "bid";
  if (
    !room.me ||
    (room.status !== "trading" && room.status !== "countdown") ||
    value === null ||
    !Number.isFinite(value) ||
    (!buying && room.me.holdings <= 0)
  )
    return empty;

  const offer = room[buying ? "ask" : "bid"];
  const ownOffer = offer?.participantId === room.me.id;
  const profitAt = (price: number) => (buying ? value - price : price - value);
  const marketAvailable =
    buying ||
    canSellAtMarket(room.me.holdings, room.ownQuotes.ask.status === "active");
  const market =
    offer && !ownOffer && marketAvailable ? profitAt(offer.price) : null;
  const price = Number(limitPrice);
  const own = room.ownQuotes[side];
  const validLimit =
    limitPrice.trim() !== "" &&
    Number.isInteger(price) &&
    price >= 1 &&
    price <= 100000 &&
    !(own.status === "active" && own.price === price);
  const crosses =
    offer && (buying ? price >= offer.price : price <= offer.price);
  const limit =
    !validLimit || (crosses && ownOffer)
      ? null
      : profitAt(crosses ? offer.price : price);
  return { limit, market };
}
