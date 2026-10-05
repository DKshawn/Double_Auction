import type { Institution } from "./study-types";

export const INSTITUTIONS: Record<
  Institution,
  { name: string; short: string; description: string }
> = {
  cda: {
    name: "連続ダブルオークション",
    short: "CDA",
    description:
      "買い手・売り手が自由に注文。条件が合えば、その場で取引します。",
  },
  call: {
    name: "一括約定市場",
    short: "Call Market",
    description: "非公開注文を集め、共通の価格で一括して取引します。",
  },
  posted: {
    name: "売り手価格提示市場",
    short: "Posted Offer",
    description: "売り手が価格を決め、買い手が決められた順番で購入します。",
  },
};
export const STUDY_RULES = {
  protocol: "institutions-v1",
  currency: "JPY",
  unitsPerPeriod: 2,
  periodsPerInstitution: 5,
  periods: 15,
  tradersPerMarket: 16,
  cdaSeconds: 180,
  callSeconds: 30,
  callsPerPeriod: 4,
  offerSeconds: 60,
  buyerSeconds: 10,
  lossMakingTradesAllowed: true,
  commission: 0,
  quoteTick: 1,
  clearingTick: 0.5,
  inventoryReset: "period-only",
  callUnfilledOrders: "expire-at-each-call",
  callSubmission: "one-final-monotone-schedule-per-participant-per-call",
  callAbstention: "no-submission-by-deadline",
  callTieBreak: "random-participant-priority-per-call-then-unit",
  cdaPriority: "price-then-time",
  cdaExecutionPrice: "resting-order",
  cdaOrderHistory: "public-ended-resting-orders-all-periods-with-status",
  studentHistoryDisplay: "current-institution-five-periods",
  teacherHistoryDisplay: "all-fifteen-periods-with-institution-filter",
  postedOffers:
    "sealed-until-configured-offer-deadline-single-price-final-quantity",
  postedSubmissionQuantity: "one-or-two-units",
  postedAbstention: "no-submission-by-deadline",
  postedBuyerOrder: "random-every-period",
  nonResponse: "skip-at-deadline",
  quantityRatioDenominator: "positive-surplus-quantity",
  alpha:
    "transaction-weighted-root-mean-square-distance-from-equilibrium-midpoint-divided-by-midpoint",
  spread:
    "time-weighted-best-ask-minus-best-bid-when-both-exist-excluding-pauses",
  convergenceSlope:
    "OLS-alpha-on-period-1-to-5-within-market-and-institution-complete-periods-only",
  grouping: "random-balanced-seat-assignment",
  comparisonUnit: "market",
  marketStart: "after-teacher-opens-and-configured-market-capacity-is-reached",
  periodProgression: "independent-per-market-auto-start-next-period-through-15",
  earlyEnd: "pending-orders-cancelled-period-marked-interrupted",
} as const;
