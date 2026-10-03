import { equilibrium } from "./equilibrium";
import type { Institution, StudyMarketView, StudyMetric } from "./study-types";
import type { RoomView } from "./types";
import type { Participant, Room } from "./auction-model";
import {
  institutionFor,
  marketFor,
  marketRound,
  stageKey,
  studyProfit,
  unitLimits,
  unitsUsed,
  type StudyMarket,
} from "./study-core";

export const studyEquilibrium = (room: Room) =>
  equilibrium(
    room.study!.settings.values.flat(),
    room.study!.settings.costs.flat(),
  );
export function studyMetrics(room: Room, now: number): StudyMetric[] {
  const eq = studyEquilibrium(room),
    benchmark = (eq.low + eq.high) / 2;
  return room.study!.markets.flatMap((m) =>
    m.periods.map((p) => {
      const trades = m.trades.filter((t) => t.round === p.round),
        n = trades.length;
      const surplus = trades.reduce((sum, t) => sum + t.value - t.cost, 0);
      const dt =
        room.phase === "running" &&
        m.stage === "cda" &&
        p.completion === "running" &&
        m.spreadValue !== null
          ? Math.max(0, Math.min(now, m.deadline!) - m.spreadAt)
          : 0;
      const spreadMs = p.spreadMs + dt,
        spreadArea = p.spreadArea + dt * (m.spreadValue ?? 0);
      return {
        market: m.id,
        round: p.round,
        institution: p.institution,
        institutionPeriod: ((p.round - 1) % 5) + 1,
        completion: p.completion,
        quantity: n,
        quantityRatio: eq.quantity ? n / eq.quantity : null,
        mean: n ? trades.reduce((s, t) => s + t.price, 0) / n : null,
        deviation: n
          ? trades.reduce(
              (s, t) => s + Math.max(eq.low - t.price, 0, t.price - eq.high),
              0,
            ) / n
          : null,
        alpha: n
          ? Math.sqrt(
              trades.reduce((s, t) => s + (t.price - benchmark) ** 2, 0) / n,
            ) / benchmark
          : null,
        surplus,
        efficiency: eq.surplus ? (100 * surplus) / eq.surplus : null,
        inefficientTrades: trades.filter((t) => t.value < t.cost).length,
        spread: spreadMs ? spreadArea / spreadMs : null,
        spreadObservedMs: spreadMs,
      };
    }),
  );
}
export function convergenceSlopes(metrics: StudyMetric[]) {
  const keys = [...new Set(metrics.map((m) => `${m.market}:${m.institution}`))];
  return keys.map((key) => {
    const [marketString, institutionString] = key.split(":"),
      market = Number(marketString),
      institution = institutionString as Institution;
    const rows = metrics.filter(
      (m) =>
        m.market === market &&
        m.institution === institution &&
        m.completion === "complete" &&
        m.alpha !== null,
    );
    const n = rows.length,
      x = n ? rows.reduce((s, m) => s + m.institutionPeriod, 0) / n : 0,
      y = n ? rows.reduce((s, m) => s + m.alpha!, 0) / n : 0;
    const denominator = rows.reduce(
      (s, m) => s + (m.institutionPeriod - x) ** 2,
      0,
    );
    return {
      market,
      institution,
      n,
      slope:
        n > 1 && denominator
          ? rows.reduce(
              (s, m) => s + (m.institutionPeriod - x) * (m.alpha! - y),
              0,
            ) / denominator
          : null,
    };
  });
}
function publicMarket(
  room: Room,
  m: StudyMarket,
  actor: Participant | "teacher",
  now: number,
): StudyMarketView {
  const isTeacher = actor === "teacher",
    id = isTeacher ? "teacher" : actor.id;
  return {
    id: m.id,
    round: marketRound(room, m),
    order: m.order,
    institution: institutionFor(room, m),
    institutionPeriod: ((Math.max(1, marketRound(room, m)) - 1) % 5) + 1,
    stage: m.stage,
    stageKey: stageKey(room, m),
    deadline: m.deadline,
    remainingMs:
      room.phase === "running" && m.deadline !== null
        ? Math.max(0, m.deadline - now)
        : m.remainingMs,
    call: m.call,
    participantCount: room.participants.filter(
      (p) => marketFor(room, p).id === m.id,
    ).length,
    activeBuyer:
      m.stage === "purchase"
        ? (room.participants.find((p) => p.id === m.buyerOrder[m.buyerIndex])
            ?.alias ?? null)
        : null,
    orders: m.stage === "cda" ? m.orders : [],
    orderHistory: (m.orderHistory ?? []).map((o) => ({
      id: o.id,
      participantId: o.participantId,
      alias: o.alias,
      side: o.side,
      price: o.price,
      unit: o.unit,
      sequence: o.sequence,
      at: o.at,
      round: o.round,
      status: o.status,
      closedAt: o.closedAt,
      closedSequence: o.closedSequence,
    })),
    offers: ["purchase", "done"].includes(m.stage)
      ? m.offers.filter((o) => o.remaining > 0)
      : [],
    clearings: m.clearings,
    // Explicit projection: other participants' values and costs never enter a student response.
    trades: m.trades.map((t) => ({
      id: t.id,
      sequence: t.sequence,
      at: t.at,
      round: t.round,
      market: t.market,
      institution: t.institution,
      call: t.call,
      price: t.price,
      buyerId: t.buyerId,
      sellerId: t.sellerId,
      buyerAlias: t.buyerAlias,
      sellerAlias: t.sellerAlias,
      buyerUnit: t.buyerUnit,
      sellerUnit: t.sellerUnit,
    })),
    myOrders: isTeacher ? [] : m.orders.filter((o) => o.participantId === id),
    submitted: m.submitted.includes(id),
    myOffer: m.offers.find((o) => o.participantId === id) ?? null,
  };
}
export function studyView(
  room: Room,
  actor: Participant | "teacher",
  now: number,
  mode: "local" | "online",
): RoomView {
  const study = room.study!,
    teacher = actor === "teacher",
    market = teacher ? study.markets[0] : marketFor(room, actor);
  const publicState = publicMarket(room, market, actor, now);
  const view: RoomView = {
    code: room.code,
    config: room.config,
    phase: room.phase,
    round: teacher
      ? Math.max(...study.markets.map((m) => marketRound(room, m)))
      : publicState.round,
    version: room.version,
    deadline: teacher ? room.deadline : publicState.deadline,
    remainingMs: teacher ? room.remainingMs : publicState.remainingMs,
    serverTime: now,
    participantCount: room.participants.length,
    quotes: [],
    trades: publicState.trades.map((t) => ({ ...t, good: "apple" })),
    mode,
    me: teacher
      ? {
          id: "teacher",
          alias: "教員",
          nickname: "教員",
          role: "teacher",
          limits: null,
          used: [],
          profit: 0,
          roundProfit: 0,
        }
      : {
          id: actor.id,
          alias: actor.alias,
          nickname: actor.nickname,
          role: actor.role,
          limits: null,
          used: [],
          profit: studyProfit(room, actor),
          roundProfit: studyProfit(room, actor, publicState.round),
        },
    study: {
      protocol: study.protocol,
      marketCount: study.markets.length,
      settingsRevision: study.revision,
      market: publicState,
      unitLimits: teacher ? null : unitLimits(room, actor),
      unitsUsed: teacher ? 0 : unitsUsed(room, actor),
      myTrades: teacher
        ? []
        : market.trades
            .filter((t) => t.buyerId === actor.id || t.sellerId === actor.id)
            .map((t) => ({
              id: t.id,
              round: t.round,
              institution: t.institution,
              price: t.price,
              unit: t.buyerId === actor.id ? t.buyerUnit : t.sellerUnit,
              profit:
                t.buyerId === actor.id ? t.value - t.price : t.price - t.cost,
            })),
    },
  };
  if (teacher) {
    const metrics = studyMetrics(room, now);
    view.study!.teacher = {
      settings: study.settings,
      markets: study.markets.map((m) => publicMarket(room, m, actor, now)),
      participants: room.participants.map((p) => ({
        id: p.id,
        market: marketFor(room, p).id,
        nickname: p.nickname,
        alias: p.alias,
        role: p.role,
        limits: unitLimits(room, p),
        profit: studyProfit(room, p),
      })),
      metrics,
      slopes: convergenceSlopes(metrics),
      equilibrium: studyEquilibrium(room),
    };
  }
  return view;
}
