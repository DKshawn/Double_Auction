import { randomInt } from "./random";
import type { PostedBid, PostedOffer, StudyOrder } from "./study-types";

export const POSTED_BATCH_MS = 1000;
function lottery(ids: string[]) {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Pure plan: the caller persists this lottery and the resulting fills together,
// under the market transaction lock. A read/retry never calls this planner.
export function postedBatchPlan(
  bids: PostedBid[],
  offers: PostedOffer[],
  cutoff: number,
  draw = lottery,
) {
  const eligible = bids.filter((bid) => bid.remaining > 0 && bid.at < cutoff);
  const prices = [...new Set(eligible.map((bid) => bid.price))].sort(
    (a, b) => b - a,
  );
  const lotteries = prices.map((price) => {
    const ids = eligible
      .filter((bid) => bid.price === price)
      .map((bid) => bid.id);
    return {
      price,
      candidates: ids,
      priority: ids.length > 1 ? draw(ids) : ids,
    };
  });
  const byId = new Map(eligible.map((bid) => [bid.id, bid]));
  const asks = offers
    .filter((offer) => offer.remaining > 0)
    .map((offer) => ({ ...offer }))
    .sort((a, b) => a.price - b.price || (a.sequence ?? 0) - (b.sequence ?? 0));
  const matches: {
    bidId: string;
    offerId: string;
    price: number;
    quantity: number;
  }[] = [];
  let askIndex = 0;
  for (const group of lotteries)
    for (const id of group.priority) {
      const bid = byId.get(id)!;
      let remaining = bid.remaining;
      while (remaining && asks[askIndex] && bid.price >= asks[askIndex].price) {
        const offer = asks[askIndex];
        const quantity = Math.min(remaining, offer.remaining);
        matches.push({
          bidId: id,
          offerId: offer.id,
          price: offer.price,
          quantity,
        });
        remaining -= quantity;
        offer.remaining -= quantity;
        if (!offer.remaining) askIndex++;
      }
    }
  return { cutoff, lotteries, matches };
}

// Reuse the existing per-unit price-level book without exposing private limits.
export function postedBookOrders(
  bids: PostedBid[],
  offers: PostedOffer[],
): StudyOrder[] {
  return [
    ...bids.map((bid) => ({ ...bid, side: "buyer" as const })),
    ...offers.map((offer) => ({ ...offer, side: "seller" as const })),
  ].flatMap((order) =>
    Array.from({ length: order.remaining }, (_, index) => ({
      id: `${order.id}:${index}`,
      participantId: order.participantId,
      alias: order.alias,
      side: order.side,
      price: order.price,
      unit: order.quantity - order.remaining + index + 1,
      sequence: order.sequence ?? 0,
      at: order.at ?? 0,
    })),
  );
}
