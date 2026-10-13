import { randomInt, randomUUID } from "./random";
import { z } from "zod";
import { isValidPrice, MAX_PRICE } from "./price";
import type {
  Institution,
  StudySettings,
  StudyStage,
  StudyOrder,
  StudyOrderHistory,
  PostedOffer,
  PostedOfferHistory,
  PostedBatchState,
  StudyTrade,
  Clearing,
  StudyLobby,
  StudyGeneration,
  StudyGeneratorConfig,
} from "./study-types";
import { generatedStudySettings, seededStudySeats } from "./study-generator";
import { STUDY_FEEDBACK_SECONDS, STUDY_START_SECONDS } from "./study-types";
import { STUDY_RULES } from "./study-rules";
import {
  MAX_STAGE_SECONDS,
  postedPurchaseSeconds,
  studyTiming,
} from "./study-timing";
import { POSTED_BATCH_MS, postedBatchPlan } from "./posted-auction";
import {
  studyCommission,
  studyCommissionError,
  studyTradeProfit,
} from "./study-commission";
import {
  MAX_STUDY_PARTICIPANTS,
  DEFAULT_STUDY_INSTITUTIONS,
  studyInstitutionOrders,
  studyMarketId,
  studyMarketSize,
  studyUnits,
  studyUnitsPerSide,
  studyUnitsError,
  studyInstitutions,
  MAX_STUDY_UNITS,
  studyRoleIndex,
  studyRole,
  MAX_INSTITUTION_PERIODS,
  studyPeriodAt,
} from "./study-config";
import {
  AuctionError,
  emit,
  type Room,
  type Participant,
  type AuditEvent,
} from "./auction-model";
import type { CommandRequest } from "./types";

export type StudyMarket = {
  id: number;
  // Older saved rooms derive their period from the existing period records.
  round?: number;
  order: Institution[];
  stage: StudyStage;
  epoch: number;
  deadline: number | null;
  remainingMs: number;
  call: number;
  orders: StudyOrder[];
  // Optional for rooms saved before public CDA order history was introduced.
  orderHistory?: StudyOrderHistory[];
  offers: PostedOffer[];
  posted?: PostedBatchState;
  // Added only when prices become public; optional for older saved rooms.
  offerHistory?: PostedOfferHistory[];
  submitted: string[];
  buyerOrder: string[];
  buyerIndex: number;
  trades: StudyTrade[];
  clearings: Clearing[];
  periods: {
    round: number;
    institution: Institution;
    completion: "running" | "complete" | "interrupted";
    startedAt: number;
    endedAt: number | null;
    spreadArea: number;
    spreadMs: number;
  }[];
  spreadAt: number;
  spreadValue: number | null;
};
export type Study = {
  protocol: "institutions-v1";
  // Absent in existing rooms, which retain their independent admission flow.
  lobby?: StudyLobby;
  settings: StudySettings;
  // When CDA's unit count changes, Call and Posted keep their two-unit conditions.
  otherSettings?: StudySettings;
  generation?: StudyGeneration;
  revision: number;
  markets: StudyMarket[];
};

const unitValues = z
  .array(z.number().int().min(1).max(MAX_PRICE))
  .min(1)
  .max(MAX_STUDY_UNITS);
const stageSeconds = z.number().int().min(1).max(MAX_STAGE_SECONDS);
export const studyInstitutionsSchema = z
  .array(z.enum(["cda", "call", "posted"]))
  .min(1, "実施する制度を1つ以上選択してください。")
  .max(3)
  .refine(
    (items) => new Set(items).size === items.length,
    "制度を重複して選択できません。",
  );
export const studyTimingSchema = z
  .object({
    cdaSeconds: stageSeconds,
    callSeconds: stageSeconds,
    offerSeconds: stageSeconds,
    buyerSeconds: stageSeconds,
    purchaseSeconds: stageSeconds.optional(),
  })
  .strict();
const institutionPeriods = z.number().int().min(1).max(MAX_INSTITUTION_PERIODS);
export const studyPeriodsSchema = z
  .object({
    cda: institutionPeriods.optional(),
    call: institutionPeriods.optional(),
    posted: institutionPeriods.optional(),
  })
  .strict();
export const studySettingsSchema = z
  .object({
    values: z
      .array(
        unitValues.refine(
          (values) => values.every((v, i) => i === 0 || v <= values[i - 1]),
          "評価値は2単位目以降で増やせません。",
        ),
      )
      .min(1)
      .max(MAX_STUDY_PARTICIPANTS / 2),
    costs: z
      .array(
        unitValues.refine(
          (values) => values.every((v, i) => i === 0 || v >= values[i - 1]),
          "費用は2単位目以降で減らせません。",
        ),
      )
      .min(1)
      .max(MAX_STUDY_PARTICIPANTS / 2),
  })
  .strict()
  .refine(
    (s) => s.values.length === s.costs.length,
    "買い手と売り手の人数をそろえてください。",
  )
  .refine(
    (s) =>
      [...s.values, ...s.costs].every(
        (values) => values.length === s.values[0]?.length,
      ),
    "全員の単位数をそろえてください。",
  );

export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function assignStudySeats(room: Room) {
  for (const [i, person] of room.participants.entries()) {
    person.seat = room.seats[i];
    person.role = studyRole(room.config, person.seat);
    person.alias = `${person.role === "buyer" ? "買" : "売"}${String(studyRoleIndex(room.config, person.seat) + 1).padStart(2, "0")}`;
    person.limits = {
      apple: unitLimits(room, person)[0],
      banana: 0,
      orange: 0,
    };
  }
}

export function recordStudyGeneratedAssignments(room: Room) {
  const generation = room.study?.generation;
  if (!generation) return;
  const perSide = studyMarketSize(room.config) / 2;
  generation.assignments = room.participants.map((p) => {
    const index = studyRoleIndex(room.config, p.seat);
    return {
      participantId: p.id,
      nickname: p.nickname,
      market: studyMarketId(room.config, p.seat),
      seat: p.seat,
      alias: p.alias,
      role: p.role,
      sortedUnits: Array.from(
        { length: studyUnits(room.config) },
        (_, unit) => index + 1 + unit * perSide,
      ),
      limits: [...unitLimits(room, p, "cda")],
    };
  });
}

// Creation and later teacher edits save the same canonical conditions and seed.
export function applyStudyGenerator(
  room: Room,
  generator: StudyGeneratorConfig,
  now: number,
) {
  if (!room.study || room.phase !== "waiting" || room.round > 0)
    throw new AuctionError("条件は実験開始前のみ変更できます。", 409);
  let settings: StudySettings;
  try {
    settings = generatedStudySettings(
      generator,
      studyUnitsPerSide(room.config),
      studyUnits(room.config),
    );
  } catch (error) {
    throw new AuctionError(
      error instanceof Error ? error.message : "生成条件を確認してください。",
    );
  }
  room.study.settings = settings;
  room.study.generation = {
    ...structuredClone(generator),
    appliedAt: now,
    assignmentConfirmedAt: null,
    assignments: [],
  };
  room.seats = seededStudySeats(room.config.capacity, generator.seed);
  assignStudySeats(room);
  if (room.study.lobby) {
    room.study.lobby.revision++;
    room.study.lobby.randomizedAt = null;
  }
  recordStudyGeneratedAssignments(room);
}
export const ORDERS = studyInstitutionOrders(DEFAULT_STUDY_INSTITUTIONS);
export function createStudy(
  count: number,
  settings: StudySettings,
  institutions: readonly Institution[] = DEFAULT_STUDY_INSTITUTIONS,
  otherSettings?: StudySettings,
): Study {
  if (!studyInstitutionsSchema.safeParse(institutions).success)
    throw new AuctionError("実施する制度を重複せず1つ以上選択してください。");
  const selected = DEFAULT_STUDY_INSTITUTIONS.filter((i) =>
    institutions.includes(i),
  );
  // A single market uses the default selected order. Multiple markets balance
  // every permutation of the selected institutions as evenly as possible.
  const candidates =
    count === 1 ? [selected] : shuffled(studyInstitutionOrders(selected));
  const orders = shuffled(
    Array.from({ length: count }, (_, i) => candidates[i % candidates.length]),
  );
  return {
    protocol: "institutions-v1",
    revision: 0,
    settings: structuredClone(settings),
    ...(otherSettings ? { otherSettings: structuredClone(otherSettings) } : {}),
    markets: orders.map((order, i) => ({
      id: i + 1,
      round: 0,
      order: [...order],
      stage: "waiting",
      epoch: 0,
      deadline: null,
      remainingMs: 0,
      call: 0,
      orders: [],
      orderHistory: [],
      offers: [],
      offerHistory: [],
      submitted: [],
      buyerOrder: [],
      buyerIndex: 0,
      trades: [],
      clearings: [],
      periods: [],
      spreadAt: 0,
      spreadValue: null,
    })),
  };
}
export const marketFor = (room: Room, p: Participant) =>
  room.study!.markets.find((m) => m.id === studyMarketId(room.config, p.seat))!;
export const marketRound = (room: Room, market: StudyMarket) =>
  market.round ?? market.periods.at(-1)?.round ?? room.round;
export const institutionFor = (room: Room, market: StudyMarket) =>
  studyPeriodAt(room.config, market.order, marketRound(room, market))
    .institution;
export const settingsForInstitution = (room: Room, institution: Institution) =>
  institution === "cda"
    ? room.study!.settings
    : (room.study!.otherSettings ?? room.study!.settings);
export const unitLimits = (
  room: Room,
  p: Participant,
  institution = institutionFor(room, marketFor(room, p)),
) =>
  settingsForInstitution(room, institution)[
    p.role === "buyer" ? "values" : "costs"
  ][studyRoleIndex(room.config, p.seat)];
export const unitsUsed = (room: Room, p: Participant) =>
  marketFor(room, p).trades.filter(
    (t) =>
      t.round === marketRound(room, marketFor(room, p)) &&
      (t.buyerId === p.id || t.sellerId === p.id),
  ).length;
export const stageKey = (room: Room, m: StudyMarket) =>
  `${marketRound(room, m)}:${m.epoch}`;
export const studyProfit = (room: Room, p: Participant, round?: number) =>
  marketFor(room, p)
    .trades.filter(
      (t) =>
        (round === undefined || t.round === round) &&
        (t.buyerId === p.id || t.sellerId === p.id),
    )
    .reduce(
      (sum, t) =>
        sum + studyTradeProfit(t, t.buyerId === p.id ? "buyer" : "seller"),
      0,
    );

function log(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
  type: string,
  actor: string,
  detail: Record<string, unknown> = {},
) {
  return emit(
    room,
    events,
    at,
    type,
    actor,
    {
      market: m.id,
      institution: institutionFor(room, m),
      stage: m.stage,
      call: m.call || null,
      ...detail,
    },
    marketRound(room, m),
  );
}
function spreadAccumulate(m: StudyMarket, at: number) {
  const period = m.periods.at(-1);
  if (period && m.stage === "cda" && m.spreadValue !== null) {
    const dt = Math.max(0, at - m.spreadAt);
    period.spreadArea += m.spreadValue * dt;
    period.spreadMs += dt;
  }
  m.spreadAt = at;
}
function archiveOrders(
  room: Room,
  m: StudyMarket,
  orders: StudyOrder[],
  status: StudyOrderHistory["status"],
  events: AuditEvent[],
  at: number,
) {
  // Only orders that actually rested on the public CDA book enter this history.
  // Only ended CDA resting orders enter this history. Call results are stored in clearings.
  for (const order of orders) {
    const closedSequence = log(
      room,
      m,
      events,
      at,
      "order-closed",
      order.participantId,
      {
        orderId: order.id,
        price: order.price,
        side: order.side,
        unit: order.unit,
        postedAt: order.at,
        status,
      },
    );
    (m.orderHistory ??= []).push({
      ...order,
      round: marketRound(room, m),
      status,
      closedAt: at,
      closedSequence,
    });
  }
}
function spreadUpdate(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  spreadAccumulate(m, at);
  const bids = m.orders.filter((o) => o.side === "buyer").map((o) => o.price);
  const asks = m.orders.filter((o) => o.side === "seller").map((o) => o.price);
  const bid = bids.length ? Math.max(...bids) : null,
    ask = asks.length ? Math.min(...asks) : null;
  m.spreadValue = bid !== null && ask !== null ? ask - bid : null;
  log(room, m, events, at, "book", "system", {
    bid,
    ask,
    spread: m.spreadValue,
  });
}
function schedule(
  m: StudyMarket,
  stage: StudyStage,
  at: number,
  seconds: number,
) {
  m.stage = stage;
  m.epoch++;
  m.remainingMs = seconds * 1000;
  m.deadline = at + m.remainingMs;
}
function sync(room: Room) {
  room.round = Math.max(
    ...room.study!.markets.map((m) => marketRound(room, m)),
  );
  const active = room.study!.markets.filter((m) => m.deadline !== null);
  room.deadline = active.length
    ? Math.min(...active.map((m) => m.deadline!))
    : null;
  if (
    ["running", "paused"].includes(room.phase) &&
    room.study!.markets.every(
      (m) => m.stage === "done" && marketRound(room, m) === room.config.rounds,
    )
  )
    room.phase = "finished";
}
function startMarket(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  m.round = marketRound(room, m) + 1;
  m.orders = [];
  m.offers = [];
  m.submitted = [];
  m.buyerOrder = [];
  m.buyerIndex = 0;
  m.call = 0;
  delete m.posted;
  m.spreadAt = at;
  m.spreadValue = null;
  const institution = institutionFor(room, m);
  m.periods.push({
    round: m.round,
    institution,
    completion: "running",
    startedAt: at,
    endedAt: null,
    spreadArea: 0,
    spreadMs: 0,
  });
  const timing = studyTiming(room.config);
  if (institution === "cda") schedule(m, "cda", at, timing.cdaSeconds);
  else if (institution === "call") {
    m.call = 1;
    schedule(m, "call", at, timing.callSeconds);
  } else {
    if (room.config.studyPostedMechanism === "batch-bids-v1")
      m.posted = { bids: [], batch: 0, endsAt: null, remainingMs: 0 };
    schedule(m, "offer", at, timing.offerSeconds);
  }
  log(room, m, events, at, "period-started", "system");
}
function finishMarket(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
  completion: "complete" | "interrupted",
  showFeedback = true,
) {
  spreadAccumulate(m, at);
  if (m.stage === "cda")
    archiveOrders(
      room,
      m,
      m.orders,
      completion === "complete" ? "expired" : "interrupted",
      events,
      at,
    );
  const period = m.periods.at(-1);
  if (
    period &&
    period.round === marketRound(room, m) &&
    period.completion === "running"
  ) {
    period.endedAt = at;
    period.completion = completion;
  }
  log(room, m, events, at, "period-ended", "system", {
    completion,
    cancelledOrders: [
      ...m.orders.map((o) => o.id),
      ...(m.posted?.bids
        .filter((bid) => bid.remaining > 0)
        .map((bid) => bid.id) ?? []),
    ],
  });
  if (m.posted) {
    m.posted.bids = [];
    m.posted.endsAt = null;
    m.posted.remainingMs = 0;
  }
  m.orders = [];
  m.stage = "done";
  m.epoch++;
  m.deadline = null;
  m.remainingMs = 0;
  m.spreadValue = null;
  if (
    showFeedback &&
    (institutionFor(room, m) === "cda" ||
      marketRound(room, m) ===
        studyPeriodAt(room.config, m.order, marketRound(room, m)).last)
  ) {
    // Hold the finished period and its fills for every participant in this market.
    schedule(m, "feedback", at, STUDY_FEEDBACK_SECONDS);
    log(room, m, events, at, "feedback-started", "system", {
      seconds: STUDY_FEEDBACK_SECONDS,
    });
  } else if (
    completion === "complete" &&
    marketRound(room, m) < room.config.rounds
  )
    startMarket(room, m, events, at);
}
function checkPrice(price: number) {
  if (!isValidPrice(price))
    throw new AuctionError(
      `注文価格は1〜${MAX_PRICE}円の整数で入力してください。`,
    );
}
function trade(
  room: Room,
  m: StudyMarket,
  buyer: Participant,
  seller: Participant,
  price: number,
  events: AuditEvent[],
  at: number,
  call: number | null = null,
) {
  const buyerUnit = unitsUsed(room, buyer) + 1,
    sellerUnit = unitsUsed(room, seller) + 1;
  const maximumUnits = studyUnits(room.config, institutionFor(room, m));
  if (buyerUnit > maximumUnits || sellerUnit > maximumUnits)
    throw new AuctionError("今期の取引可能数を超えています。", 409);
  const value = unitLimits(room, buyer)[buyerUnit - 1],
    cost = unitLimits(room, seller)[sellerUnit - 1];
  const entry: StudyTrade = {
    id: randomUUID(),
    sequence: room.sequence + 1,
    at,
    round: marketRound(room, m),
    market: m.id,
    institution: institutionFor(room, m),
    call,
    price,
    buyerId: buyer.id,
    sellerId: seller.id,
    buyerAlias: buyer.alias,
    sellerAlias: seller.alias,
    buyerUnit,
    sellerUnit,
    value,
    cost,
    commission: studyCommission(room.config),
  };
  entry.sequence = log(room, m, events, at, "trade", "system", { ...entry });
  m.trades.push(entry);
}
function clearCall(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  const priority = shuffled(
    room.participants
      .filter((p) => marketFor(room, p).id === m.id)
      .map((p) => p.id),
  );
  const rank = (o: StudyOrder) => priority.indexOf(o.participantId);
  const sorted = (side: "buyer" | "seller") =>
    m.orders
      .filter((o) => o.side === side)
      .sort(
        (a, b) =>
          (side === "buyer" ? b.price - a.price : a.price - b.price) ||
          rank(a) - rank(b) ||
          a.unit - b.unit,
      );
  const bids = sorted("buyer"),
    asks = sorted("seller");
  let q = 0;
  while (
    q < Math.min(bids.length, asks.length) &&
    bids[q].price >= asks[q].price
  )
    q++;
  const price = q ? (bids[q - 1].price + asks[q - 1].price) / 2 : null;
  const result = {
    round: marketRound(room, m),
    call: m.call,
    at,
    price,
    quantity: q,
  };
  m.clearings.push(result);
  log(room, m, events, at, "call-cleared", "system", {
    ...result,
    tiePriority: priority,
    orders: m.orders,
  });
  for (let i = 0; i < q; i++)
    trade(
      room,
      m,
      room.participants.find((p) => p.id === bids[i].participantId)!,
      room.participants.find((p) => p.id === asks[i].participantId)!,
      price!,
      events,
      at,
      m.call,
    );
  m.orders = [];
  m.submitted = [];
}
function nextBuyer(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  m.buyerIndex++;
  if (m.buyerIndex >= m.buyerOrder.length)
    finishMarket(room, m, events, at, "complete");
  else {
    schedule(m, "purchase", at, studyTiming(room.config).buyerSeconds);
    log(room, m, events, at, "buyer-turn", "system", {
      participantId: m.buyerOrder[m.buyerIndex],
    });
  }
}
function clearPosted(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
) {
  const posted = m.posted!;
  const plan = postedBatchPlan(posted.bids, m.offers, at);
  posted.batch++;
  // Persist the exact eligible cohort and random priority before applying fills.
  log(room, m, events, at, "posted-batch-cleared", "system", {
    batch: posted.batch,
    ...plan,
  });
  for (const match of plan.matches) {
    const bid = posted.bids.find((bid) => bid.id === match.bidId)!;
    const offer = m.offers.find((offer) => offer.id === match.offerId)!;
    const buyer = room.participants.find((p) => p.id === bid.participantId)!;
    const seller = room.participants.find((p) => p.id === offer.participantId)!;
    if (match.quantity > bid.remaining || match.quantity > offer.remaining)
      throw new AuctionError("在庫または注文残数量が更新されています。", 409);
    for (let unit = 0; unit < match.quantity; unit++)
      trade(room, m, buyer, seller, match.price, events, at);
    bid.remaining -= match.quantity;
    offer.remaining -= match.quantity;
  }
  if (
    at >= posted.endsAt! ||
    m.offers.every((offer) => offer.remaining === 0)
  ) {
    log(room, m, events, at, "posted-bids-expired", "system", {
      bids: posted.bids
        .filter((bid) => bid.remaining > 0)
        .map((bid) => ({ ...bid })),
    });
    posted.bids = [];
    finishMarket(room, m, events, at, "complete");
  } else {
    m.deadline = Math.min(at + POSTED_BATCH_MS, posted.endsAt!);
    m.remainingMs = m.deadline - at;
    // A batch boundary does not change the submission stage or invalidate forms.
  }
}
export function settleStudy(room: Room, now: number, events: AuditEvent[]) {
  if (room.phase !== "running") return false;
  let changed = false;
  for (const m of room.study!.markets) {
    if (
      ["waiting", "done"].includes(m.stage) &&
      marketRound(room, m) < room.config.rounds &&
      room.participants.filter((p) => marketFor(room, p).id === m.id).length ===
        studyMarketSize(room.config)
    ) {
      startMarket(room, m, events, now);
      changed = true;
    }
    while (m.deadline !== null && now >= m.deadline) {
      changed = true;
      const at = m.deadline;
      if (m.stage === "countdown") startMarket(room, m, events, at);
      else if (m.stage === "feedback") {
        log(room, m, events, at, "feedback-ended", "system");
        if (marketRound(room, m) < room.config.rounds)
          startMarket(room, m, events, at);
        else {
          m.stage = "done";
          m.epoch++;
          m.deadline = null;
          m.remainingMs = 0;
        }
      } else if (m.stage === "cda")
        finishMarket(room, m, events, at, "complete");
      else if (m.stage === "call") {
        clearCall(room, m, events, at);
        if (m.call === STUDY_RULES.callsPerPeriod)
          finishMarket(room, m, events, at, "complete");
        else {
          m.call++;
          schedule(m, "call", at, studyTiming(room.config).callSeconds);
        }
      } else if (m.stage === "offer") {
        m.buyerOrder = m.posted
          ? []
          : shuffled(
              room.participants
                .filter(
                  (p) => marketFor(room, p).id === m.id && p.role === "buyer",
                )
                .map((p) => p.id),
            );
        m.buyerIndex = 0;
        schedule(
          m,
          "purchase",
          at,
          m.posted
            ? POSTED_BATCH_MS / 1000
            : studyTiming(room.config).buyerSeconds,
        );
        if (m.posted) {
          m.posted.endsAt = at + postedPurchaseSeconds(room.config) * 1000;
          m.posted.remainingMs = m.posted.endsAt - at;
          m.deadline = Math.min(m.deadline!, m.posted.endsAt);
        }
        const sequence = log(
          room,
          m,
          events,
          at,
          "offers-published",
          "system",
          {
            offers: m.offers,
            ...(m.posted
              ? {
                  mechanism: "batch-bids-v1",
                  batchMs: POSTED_BATCH_MS,
                  endsAt: m.posted.endsAt,
                }
              : { buyerOrder: m.buyerOrder }),
          },
        );
        (m.offerHistory ??= []).push(
          ...m.offers.map((offer) => ({
            id: offer.id,
            participantId: offer.participantId,
            alias: offer.alias,
            price: offer.price,
            quantity: offer.quantity,
            round: marketRound(room, m),
            at,
            sequence,
          })),
        );
      } else if (m.stage === "purchase") {
        if (m.posted) clearPosted(room, m, events, at);
        else {
          log(room, m, events, at, "buyer-timeout", m.buyerOrder[m.buyerIndex]);
          nextBuyer(room, m, events, at);
        }
      } else break;
    }
  }
  sync(room);
  return changed;
}

export function executeStudy(
  room: Room,
  actor: Participant | "teacher",
  request: CommandRequest,
  now: number,
  events: AuditEvent[],
) {
  const actorId = actor === "teacher" ? actor : actor.id;
  if (
    room.receipts.some(
      (r) => r.actor === actorId && r.requestId === request.requestId,
    )
  )
    return;
  if (
    actor !== "teacher" &&
    request.expectedRound !== marketRound(room, marketFor(room, actor))
  )
    throw new AuctionError(
      "期が切り替わりました。最新の画面を確認してください。",
      409,
    );
  const cmd = request.command,
    study = room.study!;
  if (cmd.type === "study-randomize") {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (!study.lobby || room.phase !== "waiting" || room.round !== 0)
      throw new AuctionError("割り当ては実験開始前のみ変更できます。", 409);
    if (room.participants.length !== room.config.capacity)
      throw new AuctionError(
        "全員が入室してからランダムに割り当ててください。",
        409,
      );
    if (cmd.expectedRevision !== study.lobby.revision)
      throw new AuctionError(
        "割り当てが更新されています。最新の画面を確認してください。",
        409,
      );
    const before = room.participants.map((p) => ({
      id: p.id,
      seat: p.seat,
      role: p.role,
    }));
    room.seats = study.generation
      ? seededStudySeats(room.config.capacity, study.generation.seed)
      : shuffled(Array.from({ length: room.config.capacity }, (_, i) => i));
    assignStudySeats(room);
    study.lobby.revision++;
    study.lobby.randomizedAt = now;
    if (study.generation) {
      study.generation.assignmentConfirmedAt = now;
      recordStudyGeneratedAssignments(room);
    }
    emit(room, events, now, "participants-randomized", actorId, {
      revision: study.lobby.revision,
      ...(study.generation ? { seed: study.generation.seed } : {}),
      before,
      assignments: room.participants.map((p) => ({
        id: p.id,
        seat: p.seat,
        market: studyMarketId(room.config, p.seat),
        role: p.role,
        alias: p.alias,
        unitLimits: unitLimits(room, p),
      })),
    });
  } else if (
    cmd.type === "study-settings" ||
    cmd.type === "study-timing" ||
    cmd.type === "study-commission"
  ) {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (room.round !== 0 || room.phase !== "waiting")
      throw new AuctionError("条件は実験開始前のみ変更できます。", 409);
    if (cmd.expectedRevision !== study.revision)
      throw new AuctionError(
        "条件が更新されています。再読込してください。",
        409,
      );
    if (cmd.type === "study-commission") {
      const error = studyCommissionError(
        cmd.commission,
        study.settings,
        studyInstitutions(room.config).some((i) => i !== "cda")
          ? study.otherSettings
          : undefined,
      );
      if (error) throw new AuctionError(error);
      room.config.studyCommission = cmd.commission;
      study.revision++;
      emit(room, events, now, "study-commission", "teacher", {
        commission: cmd.commission,
        basis: "per-filled-unit-per-participant",
        revision: study.revision,
      });
    } else if (cmd.type === "study-timing") {
      const parsed = studyTimingSchema.safeParse(cmd.timing);
      if (!parsed.success)
        throw new AuctionError(
          `各時間は1〜${MAX_STAGE_SECONDS}秒の整数で設定してください。`,
        );
      room.config.studyTiming = parsed.data;
      room.config.duration = parsed.data.cdaSeconds;
      study.revision++;
      emit(room, events, now, "study-timing", "teacher", {
        timing: parsed.data,
        revision: study.revision,
      });
    } else {
      const units = cmd.unitsPerParticipant ?? studyUnits(room.config);
      const unitsError = studyUnitsError(units);
      if (unitsError) throw new AuctionError(unitsError);
      if (
        units !== studyUnits(room.config) &&
        !studyInstitutions(room.config).includes("cda")
      )
        throw new AuctionError(
          "CDAを実施しないルームの単位数は変更できません。",
        );
      const parsed = studySettingsSchema.safeParse(cmd.settings);
      if (
        !parsed.success ||
        parsed.data.values.length !== studyMarketSize(room.config) / 2 ||
        parsed.data.values[0].length !== units
      )
        throw new AuctionError(
          `買い手・売り手それぞれ${studyMarketSize(room.config) / 2}人×${units}単位の条件を確認してください。評価値は低下、費用は上昇するように設定します。`,
        );
      // Recompute on the authoritative engine; client metadata cannot mislabel
      // a manually edited schedule as a reproducible generated condition.
      if (cmd.generator) {
        try {
          const generated = generatedStudySettings(
            cmd.generator,
            (studyMarketSize(room.config) / 2) * units,
            units,
          );
          if (JSON.stringify(generated) !== JSON.stringify(parsed.data))
            throw new Error(
              "生成条件と価値・費用が一致しません。再度プレビューしてください。",
            );
        } catch (error) {
          throw new AuctionError(
            error instanceof Error
              ? error.message
              : "生成条件を確認してください。",
          );
        }
      }
      const commission = cmd.commission ?? studyCommission(room.config);
      const error = studyCommissionError(
        commission,
        parsed.data,
        studyInstitutions(room.config).some((i) => i !== "cda")
          ? (study.otherSettings ??
              (units !== studyUnits(room.config) ? study.settings : undefined))
          : undefined,
      );
      if (error) throw new AuctionError(error);
      const unitsChanged = units !== studyUnits(room.config);
      if (unitsChanged && !study.otherSettings)
        study.otherSettings = structuredClone(study.settings);
      study.settings = parsed.data;
      room.config.studyCdaUnits = units;
      room.config.studyCommission = commission;
      if (cmd.generator) {
        applyStudyGenerator(room, cmd.generator, now);
      } else {
        delete study.generation;
        // A manual edit keeps the existing seats and role order, including old
        // rooms and demos without a saved seat permutation.
        for (const participant of room.participants)
          participant.limits.apple = unitLimits(room, participant)[0];
        if (unitsChanged && study.lobby) {
          study.lobby.revision++;
          study.lobby.randomizedAt = null;
        }
      }
      study.revision++;
      emit(room, events, now, "study-settings", "teacher", {
        settings: study.settings,
        ...(study.otherSettings ? { otherSettings: study.otherSettings } : {}),
        commission,
        unitsPerParticipant: units,
        ...(study.generation
          ? { generation: structuredClone(study.generation) }
          : {}),
        revision: study.revision,
      });
    }
  } else if (
    ["start", "pause", "resume", "end-round", "finish"].includes(cmd.type)
  ) {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (cmd.type === "start") {
      if (!["waiting", "review"].includes(room.phase))
        throw new AuctionError("今は実験を開始できません。", 409);
      if (room.round === 0) {
        const error = studyCommissionError(
          studyCommission(room.config),
          study.settings,
          studyInstitutions(room.config).some((i) => i !== "cda")
            ? study.otherSettings
            : undefined,
        );
        if (error) throw new AuctionError(error);
      }
      if (study.lobby) {
        if (room.participants.length !== room.config.capacity)
          throw new AuctionError(
            "全員の入室を待ってから開始してください。",
            409,
          );
        if (study.lobby.randomizedAt === null)
          throw new AuctionError(
            "先に学生をランダムに割り当ててください。",
            409,
          );
        for (const m of study.markets)
          schedule(m, "countdown", now, STUDY_START_SECONDS);
        emit(room, events, now, "start-countdown", actorId, {
          seconds: STUDY_START_SECONDS,
          startsAt: now + STUDY_START_SECONDS * 1000,
          assignmentRevision: study.lobby.revision,
        });
      }
      if (study.generation) {
        study.generation.assignmentConfirmedAt ??= now;
        recordStudyGeneratedAssignments(room);
      }
      room.phase = "running";
      emit(room, events, now, "experiment-started", actorId);
      settleStudy(room, now, events);
    } else if (cmd.type === "pause") {
      if (room.phase !== "running")
        throw new AuctionError("取引中のみ一時停止できます。", 409);
      for (const m of study.markets)
        if (m.deadline !== null) {
          spreadAccumulate(m, now);
          m.remainingMs = Math.max(0, m.deadline - now);
          m.deadline = null;
          if (m.stage === "purchase" && m.posted) {
            m.posted.remainingMs = Math.max(0, m.posted.endsAt! - now);
            m.posted.endsAt = null;
          }
        }
      room.phase = "paused";
      emit(room, events, now, "paused", actorId);
    } else if (cmd.type === "resume") {
      if (room.phase !== "paused")
        throw new AuctionError("現在は一時停止していません。", 409);
      for (const m of study.markets)
        if (!["done", "waiting"].includes(m.stage)) {
          m.deadline = now + m.remainingMs;
          if (m.stage === "purchase" && m.posted)
            m.posted.endsAt = now + m.posted.remainingMs;
          m.spreadAt = now;
        }
      room.phase = "running";
      emit(room, events, now, "resumed", actorId);
      settleStudy(room, now, events);
    } else {
      if (
        cmd.type === "end-round" &&
        (!["running", "paused"].includes(room.phase) ||
          !study.markets.some(
            (m) =>
              !["done", "waiting", "countdown", "feedback"].includes(m.stage),
          ))
      )
        throw new AuctionError("進行中の期がありません。", 409);
      if (room.phase === "finished")
        throw new AuctionError("実験は終了しています。", 409);
      for (const m of study.markets)
        if (!["done", "waiting"].includes(m.stage)) {
          if (m.stage === "feedback" && cmd.type === "end-round") continue;
          if (["countdown", "feedback"].includes(m.stage)) {
            m.stage = "done";
            m.epoch++;
            m.deadline = null;
            m.remainingMs = 0;
            continue;
          }
          if (room.phase === "paused") m.spreadAt = now;
          finishMarket(
            room,
            m,
            events,
            now,
            "interrupted",
            cmd.type !== "finish",
          );
          if (cmd.type === "end-round") {
            if (
              m.stage !== "feedback" &&
              marketRound(room, m) < room.config.rounds
            )
              startMarket(room, m, events, now);
            if (room.phase === "paused") m.deadline = null;
          }
        }
      if (cmd.type === "finish") room.phase = "finished";
      emit(
        room,
        events,
        now,
        cmd.type === "finish" ? "experiment-ended" : "period-interrupted",
        actorId,
      );
    }
  } else {
    if (actor === "teacher")
      throw new AuctionError("教員は取引できません。", 403);
    const m = marketFor(room, actor);
    if (
      room.phase !== "running" ||
      ["done", "waiting", "countdown", "feedback"].includes(m.stage)
    )
      throw new AuctionError("現在は取引時間外です。", 409);
    if (request.expectedStage !== stageKey(room, m))
      throw new AuctionError(
        "受付時間または取引段階が切り替わりました。最新の画面を確認してください。",
        409,
      );
    const maximumUnits = studyUnits(room.config, institutionFor(room, m));
    const remaining = maximumUnits - unitsUsed(room, actor);
    if (
      cmd.type === "study-quote" ||
      cmd.type === "study-accept" ||
      cmd.type === "study-cancel"
    ) {
      if (m.stage !== "cda")
        throw new AuctionError(
          "この操作はCDAの取引時間中のみ利用できます。",
          409,
        );
      if (cmd.type === "study-cancel") {
        const cancelled = m.orders.filter((o) => o.participantId === actor.id);
        archiveOrders(room, m, cancelled, "cancelled", events, now);
        m.orders = m.orders.filter((o) => o.participantId !== actor.id);
        log(room, m, events, now, "cancel", actor.id, {
          orders: cancelled.map((o) => o.id),
        });
      } else {
        if (!remaining)
          throw new AuctionError(
            `今期は${maximumUnits}単位の取引が完了しています。`,
            409,
          );
        const opposite = m.orders
          .filter((o) => o.side !== actor.role)
          .sort(
            (a, b) =>
              (actor.role === "buyer"
                ? a.price - b.price
                : b.price - a.price) || a.sequence - b.sequence,
          )[0];
        if (
          cmd.type === "study-accept" &&
          (!opposite || opposite.id !== cmd.orderId)
        )
          throw new AuctionError("最良注文が変更または約定済みです。", 409);
        const price = cmd.type === "study-quote" ? cmd.price : opposite.price;
        checkPrice(price);
        archiveOrders(
          room,
          m,
          m.orders.filter((o) => o.participantId === actor.id),
          "replaced",
          events,
          now,
        );
        m.orders = m.orders.filter((o) => o.participantId !== actor.id);
        const id = randomUUID(),
          sequence = log(room, m, events, now, "quote", actor.id, {
            id,
            price,
            unit: maximumUnits + 1 - remaining,
            side: actor.role,
          });
        if (
          opposite &&
          (actor.role === "buyer"
            ? price >= opposite.price
            : price <= opposite.price)
        ) {
          const other = room.participants.find(
            (p) => p.id === opposite.participantId,
          )!;
          m.orders = m.orders.filter((o) => o.id !== opposite.id);
          trade(
            room,
            m,
            actor.role === "buyer" ? actor : other,
            actor.role === "seller" ? actor : other,
            opposite.price,
            events,
            now,
          );
          archiveOrders(room, m, [opposite], "filled", events, now);
        } else
          m.orders.push({
            id,
            sequence,
            participantId: actor.id,
            alias: actor.alias,
            side: actor.role,
            price,
            unit: maximumUnits + 1 - remaining,
            at: now,
          });
      }
      spreadUpdate(room, m, events, now);
    } else if (cmd.type === "call-submit") {
      if (m.stage !== "call" || m.submitted.includes(actor.id))
        throw new AuctionError(
          "この回の注文は受付終了または送信済みです。",
          409,
        );
      if (!cmd.prices.length || cmd.prices.length > remaining)
        throw new AuctionError("残りの取引可能数を確認してください。");
      cmd.prices.forEach(checkPrice);
      if (
        cmd.prices.some(
          (p, i) =>
            i > 0 &&
            (actor.role === "buyer"
              ? p > cmd.prices[i - 1]
              : p < cmd.prices[i - 1]),
        )
      )
        throw new AuctionError(
          "2単位目の買値は1単位目以下、売値は1単位目以上にしてください。",
        );
      for (const [i, price] of cmd.prices.entries()) {
        const id = randomUUID(),
          unit = maximumUnits + 1 - remaining + i;
        const sequence = log(room, m, events, now, "call-order", actor.id, {
          id,
          unit,
          price,
          side: actor.role,
        });
        m.orders.push({
          id,
          unit,
          price,
          sequence,
          participantId: actor.id,
          alias: actor.alias,
          side: actor.role,
          at: now,
        });
      }
      m.submitted.push(actor.id);
    } else if (cmd.type === "posted-offer") {
      if (
        m.stage !== "offer" ||
        actor.role !== "seller" ||
        m.submitted.includes(actor.id)
      )
        throw new AuctionError(
          "売り手は価格提示中に1回だけ送信できます。",
          409,
        );
      checkPrice(cmd.price);
      if (
        !Number.isInteger(cmd.quantity) ||
        cmd.quantity < 1 ||
        cmd.quantity > remaining
      )
        throw new AuctionError(
          `数量は1〜${maximumUnits}単位で、残りの取引可能数以内にしてください。`,
        );
      const offer: PostedOffer = {
        id: randomUUID(),
        participantId: actor.id,
        alias: actor.alias,
        price: cmd.price,
        quantity: cmd.quantity,
        remaining: cmd.quantity,
      };
      if (m.posted) {
        offer.sequence = room.sequence + 1;
        offer.at = now;
      }
      m.offers.push(offer);
      m.submitted.push(actor.id);
      log(room, m, events, now, "posted-offer", actor.id, { ...offer });
    } else if (cmd.type === "posted-bid") {
      if (m.stage !== "purchase" || !m.posted || actor.role !== "buyer")
        throw new AuctionError(
          "買い手は共通の取引時間中に買い注文を送信できます。",
          409,
        );
      checkPrice(cmd.price);
      const reserved = m.posted.bids
        .filter((bid) => bid.participantId === actor.id)
        .reduce((sum, bid) => sum + bid.remaining, 0);
      if (
        !Number.isInteger(cmd.quantity) ||
        cmd.quantity < 1 ||
        cmd.quantity > remaining - reserved
      )
        throw new AuctionError(
          "注文中の数量を含め、残りの購入可能数を確認してください。",
          409,
        );
      const bid = {
        id: randomUUID(),
        participantId: actor.id,
        alias: actor.alias,
        price: cmd.price,
        quantity: cmd.quantity,
        remaining: cmd.quantity,
        at: now,
        sequence: room.sequence + 1,
      };
      m.posted.bids.push(bid);
      log(room, m, events, now, "posted-bid", actor.id, { ...bid });
    } else if (cmd.type === "posted-buy" || cmd.type === "posted-pass") {
      if (
        m.posted ||
        m.stage !== "purchase" ||
        actor.role !== "buyer" ||
        m.buyerOrder[m.buyerIndex] !== actor.id
      )
        throw new AuctionError("現在はあなたの購入時間ではありません。", 409);
      if (cmd.type === "posted-buy") {
        const offer = m.offers.find((o) => o.id === cmd.offerId);
        if (
          !offer ||
          !Number.isInteger(cmd.quantity) ||
          cmd.quantity < 1 ||
          cmd.quantity > Math.min(remaining, offer.remaining)
        )
          throw new AuctionError(
            "在庫または購入可能数を確認してください。",
            409,
          );
        const seller = room.participants.find(
          (p) => p.id === offer.participantId,
        )!;
        for (let i = 0; i < cmd.quantity; i++)
          trade(room, m, actor, seller, offer.price, events, now);
        offer.remaining -= cmd.quantity;
        if (unitsUsed(room, actor) === maximumUnits)
          nextBuyer(room, m, events, now);
      } else {
        log(room, m, events, now, "buyer-pass", actor.id);
        nextBuyer(room, m, events, now);
      }
    } else throw new AuctionError("この実験では利用できない操作です。");
  }
  room.receipts.push({ actor: actorId, requestId: request.requestId });
  sync(room);
}
