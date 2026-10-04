import { randomInt, randomUUID } from "./random";
import { z } from "zod";
import type {
  Institution,
  StudySettings,
  StudyStage,
  StudyOrder,
  StudyOrderHistory,
  PostedOffer,
  StudyTrade,
  Clearing,
} from "./study-types";
import { STUDY_RULES } from "./study-rules";
import { MAX_STAGE_SECONDS, studyTiming } from "./study-timing";
import {
  MAX_STUDY_PARTICIPANTS,
  studyMarketId,
  studyMarketSize,
  studyRoleIndex,
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
  settings: StudySettings;
  revision: number;
  markets: StudyMarket[];
};

const pair = z.tuple([
  z.number().int().min(1).max(999),
  z.number().int().min(1).max(999),
]);
const stageSeconds = z.number().int().min(1).max(MAX_STAGE_SECONDS);
export const studyTimingSchema = z
  .object({
    cdaSeconds: stageSeconds,
    callSeconds: stageSeconds,
    offerSeconds: stageSeconds,
    buyerSeconds: stageSeconds,
  })
  .strict();
export const studySettingsSchema = z
  .object({
    values: z
      .array(pair.refine(([a, b]) => a >= b, "評価値は2単位目で増やせません。"))
      .min(1)
      .max(MAX_STUDY_PARTICIPANTS / 2),
    costs: z
      .array(pair.refine(([a, b]) => a <= b, "費用は2単位目で減らせません。"))
      .min(1)
      .max(MAX_STUDY_PARTICIPANTS / 2),
  })
  .strict()
  .refine(
    (s) => s.values.length === s.costs.length,
    "買い手と売り手の人数をそろえてください。",
  );

export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export const ORDERS: Institution[][] = [
  ["cda", "call", "posted"],
  ["cda", "posted", "call"],
  ["call", "cda", "posted"],
  ["call", "posted", "cda"],
  ["posted", "cda", "call"],
  ["posted", "call", "cda"],
];
export function createStudy(count: number, settings: StudySettings): Study {
  // Keep the one-market teaching preset; otherwise distribute all six orders
  // as evenly as possible, without favouring the first orders in smaller rooms.
  const candidates = count === 1 ? [ORDERS[0]] : shuffled(ORDERS);
  const orders = shuffled(
    Array.from({ length: count }, (_, i) => candidates[i % candidates.length]),
  );
  return {
    protocol: "institutions-v1",
    revision: 0,
    settings: structuredClone(settings),
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
  market.order[Math.floor((Math.max(1, marketRound(room, market)) - 1) / 5)];
export const unitLimits = (room: Room, p: Participant) =>
  room.study!.settings[p.role === "buyer" ? "values" : "costs"][
    studyRoleIndex(room.config, p.seat)
  ];
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
        sum + (t.buyerId === p.id ? t.value - t.price : t.price - t.cost),
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
  // Incoming marketable limits and sealed Call orders remain private.
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
      (m) => m.stage === "done" && marketRound(room, m) === 15,
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
  } else schedule(m, "offer", at, timing.offerSeconds);
  log(room, m, events, at, "period-started", "system");
}
function finishMarket(
  room: Room,
  m: StudyMarket,
  events: AuditEvent[],
  at: number,
  completion: "complete" | "interrupted",
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
    cancelledOrders: m.orders.map((o) => o.id),
  });
  m.orders = [];
  m.stage = "done";
  m.epoch++;
  m.deadline = null;
  m.remainingMs = 0;
  m.spreadValue = null;
  if (completion === "complete" && marketRound(room, m) < 15)
    startMarket(room, m, events, at);
}
function checkPrice(price: number) {
  if (!Number.isInteger(price) || price < 1 || price > 999)
    throw new AuctionError("注文価格は1〜999円の整数で入力してください。");
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
  if (buyerUnit > 2 || sellerUnit > 2)
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
export function settleStudy(room: Room, now: number, events: AuditEvent[]) {
  if (room.phase !== "running") return false;
  let changed = false;
  for (const m of room.study!.markets) {
    if (
      ["waiting", "done"].includes(m.stage) &&
      marketRound(room, m) < 15 &&
      room.participants.filter((p) => marketFor(room, p).id === m.id).length ===
        studyMarketSize(room.config)
    ) {
      startMarket(room, m, events, now);
      changed = true;
    }
    while (m.deadline !== null && now >= m.deadline) {
      changed = true;
      const at = m.deadline;
      if (m.stage === "cda") finishMarket(room, m, events, at, "complete");
      else if (m.stage === "call") {
        clearCall(room, m, events, at);
        if (m.call === STUDY_RULES.callsPerPeriod)
          finishMarket(room, m, events, at, "complete");
        else {
          m.call++;
          schedule(m, "call", at, studyTiming(room.config).callSeconds);
        }
      } else if (m.stage === "offer") {
        m.buyerOrder = shuffled(
          room.participants
            .filter((p) => marketFor(room, p).id === m.id && p.role === "buyer")
            .map((p) => p.id),
        );
        m.buyerIndex = 0;
        schedule(m, "purchase", at, studyTiming(room.config).buyerSeconds);
        log(room, m, events, at, "offers-published", "system", {
          offers: m.offers,
          buyerOrder: m.buyerOrder,
        });
      } else if (m.stage === "purchase") {
        log(room, m, events, at, "buyer-timeout", m.buyerOrder[m.buyerIndex]);
        nextBuyer(room, m, events, at);
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
  if (cmd.type === "study-settings" || cmd.type === "study-timing") {
    if (actor !== "teacher")
      throw new AuctionError("この操作は教員のみ利用できます。", 403);
    if (room.round !== 0 || room.phase !== "waiting")
      throw new AuctionError("条件は実験開始前のみ変更できます。", 409);
    if (cmd.expectedRevision !== study.revision)
      throw new AuctionError(
        "条件が更新されています。再読込してください。",
        409,
      );
    if (cmd.type === "study-timing") {
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
      const parsed = studySettingsSchema.safeParse(cmd.settings);
      if (
        !parsed.success ||
        parsed.data.values.length !== studyMarketSize(room.config) / 2
      )
        throw new AuctionError(
          `買い手・売り手それぞれ${studyMarketSize(room.config) / 2}人×2単位の条件を確認してください。評価値は低下、費用は上昇するように設定します。`,
        );
      study.settings = parsed.data;
      study.revision++;
      emit(room, events, now, "study-settings", "teacher", {
        settings: study.settings,
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
        }
      room.phase = "paused";
      emit(room, events, now, "paused", actorId);
    } else if (cmd.type === "resume") {
      if (room.phase !== "paused")
        throw new AuctionError("現在は一時停止していません。", 409);
      for (const m of study.markets)
        if (!["done", "waiting"].includes(m.stage)) {
          m.deadline = now + m.remainingMs;
          m.spreadAt = now;
        }
      room.phase = "running";
      emit(room, events, now, "resumed", actorId);
      settleStudy(room, now, events);
    } else {
      if (
        cmd.type === "end-round" &&
        (!["running", "paused"].includes(room.phase) ||
          !study.markets.some((m) => !["done", "waiting"].includes(m.stage)))
      )
        throw new AuctionError("進行中の期がありません。", 409);
      if (room.phase === "finished")
        throw new AuctionError("実験は終了しています。", 409);
      for (const m of study.markets)
        if (!["done", "waiting"].includes(m.stage)) {
          if (room.phase === "paused") m.spreadAt = now;
          finishMarket(room, m, events, now, "interrupted");
          if (cmd.type === "end-round" && marketRound(room, m) < 15) {
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
    if (room.phase !== "running" || ["done", "waiting"].includes(m.stage))
      throw new AuctionError("現在は取引時間外です。", 409);
    if (request.expectedStage !== stageKey(room, m))
      throw new AuctionError(
        "受付時間または購入順が切り替わりました。最新の画面を確認してください。",
        409,
      );
    const remaining = 2 - unitsUsed(room, actor);
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
          throw new AuctionError("今期は2単位の取引が完了しています。", 409);
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
            unit: 3 - remaining,
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
            unit: 3 - remaining,
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
          unit = 3 - remaining + i;
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
        cmd.quantity < 0 ||
        cmd.quantity > remaining
      )
        throw new AuctionError("数量は残りの取引可能数以内にしてください。");
      const offer = {
        id: randomUUID(),
        participantId: actor.id,
        alias: actor.alias,
        price: cmd.price,
        quantity: cmd.quantity,
        remaining: cmd.quantity,
      };
      m.offers.push(offer);
      m.submitted.push(actor.id);
      log(room, m, events, now, "posted-offer", actor.id, { ...offer });
    } else if (cmd.type === "posted-buy" || cmd.type === "posted-pass") {
      if (
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
        if (unitsUsed(room, actor) === 2) nextBuyer(room, m, events, now);
      } else {
        log(room, m, events, now, "buyer-pass", actor.id);
        nextBuyer(room, m, events, now);
      }
    } else throw new AuctionError("この実験では利用できない操作です。");
  }
  room.receipts.push({ actor: actorId, requestId: request.requestId });
  sync(room);
}
