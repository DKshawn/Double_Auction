import type {
  Action,
  Actor,
  AuditEvent,
  Config,
  Participant,
  PeriodResult,
  Room,
  RoomView,
  Side,
} from "./types";
import { initialUnitsFor, MAX_MARKET_SIZE } from "./settings";

export class RuleError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
export const unitKey = (r: Pick<Room, "year" | "period" | "unit">) =>
  `${r.year}-${r.period}-${r.unit}`;
export const phaseKey = (
  r: Pick<Room, "year" | "period" | "status" | "pausedAt" | "reveal">,
) => `${r.year}-${r.period}-${r.status}-${r.pausedAt ?? "live"}-${r.reveal}`;
export function benchmarks(config: Config) {
  return {
    naiveA: Math.max(...config.dividends.map((d) => d.a + d.b)),
    perfectA:
      Math.max(...config.dividends.map((d) => d.a)) +
      Math.max(...config.dividends.map((d) => d.b)),
    perfectB: Math.max(...config.dividends.map((d) => d.b)),
  };
}
export function newRoom(
  code: string,
  config: Config,
  now: number,
  teacherPasswordHash = "",
  teacherTokenHash = "",
): Room {
  return {
    code,
    schemaVersion: 1,
    config: structuredClone(config),
    createdAt: now,
    revision: 0,
    teacherPasswordHash,
    teacherTokenHash,
    participants: [],
    status: "lobby",
    year: 1,
    period: "A",
    unit: 0,
    emptyUnits: 0,
    nominatedSeat: null,
    periodEndsAt: null,
    unitEndsAt: null,
    breakEndsAt: null,
    pausedAt: null,
    bid: null,
    ask: null,
    trades: [],
    results: [],
    events: [],
    reveal: false,
  };
}
export function record(
  room: Room,
  kind: string,
  actor: string,
  now: number,
  details: AuditEvent["details"] = {},
) {
  room.revision++;
  room.events.push({
    sequence: room.events.length + 1,
    at: now,
    kind,
    actor,
    details,
  });
}
export function addParticipant(
  room: Room,
  person: Pick<
    Participant,
    "id" | "name" | "studentId" | "pinHash" | "tokenHash"
  >,
  now: number,
) {
  requireRule(
    room.status === "lobby",
    "受付は終了しました。登録済みの参加者は再入室できます。",
  );
  requireRule(
    room.participants.length < MAX_MARKET_SIZE,
    "この市場は定員に達しています。",
  );
  requireRule(
    !room.participants.some((p) => p.studentId === person.studentId),
    "この参加者番号は登録済みです。PINを確認してください。",
  );
  room.participants.push({
    ...person,
    seat: null,
    type: null,
    holdings: 0,
    cash: 0,
    dividend: 0,
    totalProfit: 0,
    joinedAt: now,
  });
  record(room, "joined", person.id, now);
}
function beginUnit(room: Room, now: number, random: () => number) {
  room.unit++;
  room.bid = null;
  room.ask = null;
  room.unitEndsAt = Math.min(
    now + room.config.unitSeconds * 1000,
    room.periodEndsAt!,
  );
  room.nominatedSeat =
    room.participants[Math.floor(random() * room.participants.length)]!.seat;
  record(room, "unit-started", "system", now, {
    unit: room.unit,
    nominatedSeat: room.nominatedSeat,
    year: room.year,
    period: room.period,
  });
}
function beginPeriod(room: Room, now: number, random: () => number) {
  room.status = "trading";
  room.emptyUnits = 0;
  room.unit = 0;
  room.periodEndsAt = now + room.config.periodSeconds * 1000;
  room.breakEndsAt = null;
  record(room, "period-started", "system", now, {
    year: room.year,
    period: room.period,
  });
  beginUnit(room, now, random);
}
function beginYear(room: Room, now: number, random: () => number) {
  room.period = "A";
  for (const p of room.participants) {
    p.holdings = initialUnitsFor(room.config);
    p.cash = 0;
    p.dividend = 0;
  }
  beginPeriod(room, now, random);
}
export function endPeriod(
  room: Room,
  now: number,
  reason: PeriodResult["reason"],
  random: () => number = Math.random,
) {
  requireRule(
    room.status === "trading" && room.pausedAt === null,
    "取引中の期だけ終了できます。",
  );
  const period = room.period;
  const trades = room.trades.filter(
    (t) => t.year === room.year && t.period === period,
  );
  const payouts = room.participants.map((p) => {
    const d = room.config.dividends[p.type! - 1]!;
    const perUnit = period === "A" ? d.a : d.b;
    const dividend = p.holdings * perUnit;
    p.dividend += dividend;
    if (period === "B") p.totalProfit += p.cash + p.dividend;
    return {
      participantId: p.id,
      seat: p.seat!,
      holdings: p.holdings,
      perUnit,
      dividend,
      cash: p.cash,
      yearProfit: p.cash + p.dividend,
    };
  });
  const actualDividend = payouts.reduce((s, p) => s + p.dividend, 0);
  const maxDividend =
    room.participants.length *
    initialUnitsFor(room.config) *
    Math.max(...payouts.map((p) => p.perUnit));
  const initialDividend = room.participants.reduce(
    (s, p) =>
      s +
      initialUnitsFor(room.config) *
        (period === "A"
          ? room.config.dividends[p.type! - 1]!.a
          : room.config.dividends[p.type! - 1]!.b),
    0,
  );
  const meanPrice = trades.length
    ? trades.reduce((s, t) => s + t.price, 0) / trades.length
    : null;
  const ref = benchmarks(room.config);
  room.results.push({
    year: room.year,
    period,
    endedAt: now,
    reason,
    payouts,
    volume: trades.length,
    meanPrice,
    priceRatio:
      meanPrice === null
        ? null
        : meanPrice / (period === "A" ? ref.perfectA : ref.perfectB),
    actualDividend,
    maxDividend,
    initialDividend,
    allocationEfficiency: actualDividend / maxDividend,
    gainEfficiency:
      maxDividend === initialDividend
        ? null
        : (actualDividend - initialDividend) / (maxDividend - initialDividend),
  });
  room.bid = null;
  room.ask = null;
  room.unitEndsAt = null;
  room.periodEndsAt = null;
  room.nominatedSeat = null;
  record(room, "period-ended", "system", now, {
    year: room.year,
    period,
    reason,
    actualDividend,
  });
  if (period === "A") {
    room.period = "B";
    beginPeriod(room, now, random);
  } else {
    for (const p of room.participants) p.holdings = 0;
    if (room.year === room.config.rounds) {
      room.status = "completed";
      room.breakEndsAt = null;
    } else {
      room.status = "break";
      room.breakEndsAt = now + room.config.breakSeconds * 1000;
    }
  }
}
/** Deadlines are persisted. Reconnection catches up at each original deadline, never at client time. */
export function advanceClock(
  room: Room,
  now: number,
  random: () => number = Math.random,
) {
  if (
    room.pausedAt !== null ||
    room.status === "lobby" ||
    room.status === "completed"
  )
    return;
  for (let i = 0; i < 1000; i++) {
    if (room.status === "break") {
      if (now < room.breakEndsAt!) return;
      const at = room.breakEndsAt!;
      room.year++;
      beginYear(room, at, random);
      continue;
    }
    if (room.status !== "trading") return;
    if (room.unitEndsAt! <= now && room.unitEndsAt! < room.periodEndsAt!) {
      const at = room.unitEndsAt!;
      room.emptyUnits++;
      record(room, "unit-expired", "system", at, {
        year: room.year,
        period: room.period,
        unit: room.unit,
      });
      if (room.emptyUnits >= 2) endPeriod(room, at, "inactivity", random);
      else beginUnit(room, at, random);
      continue;
    }
    if (room.periodEndsAt! <= now) {
      endPeriod(room, room.periodEndsAt!, "deadline", random);
      continue;
    }
    return;
  }
  throw new Error("Clock transition limit exceeded");
}
function settle(
  room: Room,
  buyerId: string,
  sellerId: string,
  price: number,
  now: number,
  random: () => number,
) {
  requireRule(buyerId !== sellerId, "自分の提示とは取引できません。");
  const buyer = room.participants.find((p) => p.id === buyerId)!;
  const seller = room.participants.find((p) => p.id === sellerId)!;
  requireRule(seller.holdings > 0, "売り手の保有証券が不足しています。");
  buyer.holdings++;
  seller.holdings--;
  buyer.cash -= price;
  seller.cash += price;
  room.trades.push({
    id: `t${room.trades.length + 1}`,
    sequence: room.trades.length + 1,
    year: room.year,
    period: room.period,
    unit: room.unit,
    buyerId,
    sellerId,
    buyerSeat: buyer.seat!,
    sellerSeat: seller.seat!,
    price,
    at: now,
  });
  record(room, "traded", buyerId, now, {
    sellerId,
    price,
    year: room.year,
    period: room.period,
    unit: room.unit,
  });
  room.emptyUnits = 0;
  beginUnit(room, now, random);
}
export function assignParticipants(
  room: Room,
  random: () => number = Math.random,
) {
  requireRule(room.status === "lobby", "開始後は割り当てを変更できません。");
  const counts =
    room.typeCounts ??
    Array.from(
      { length: 3 },
      (_, i) =>
        Math.floor(room.participants.length / 3) +
        (i < room.participants.length % 3 ? 1 : 0),
    );
  requireRule(
    counts.length === 3 &&
      counts.every((n) => Number.isInteger(n) && n > 0) &&
      counts.reduce((a, b) => a + b, 0) === room.participants.length,
    "タイプの割り当てを確認してください。",
  );
  const seats = Array.from(
    { length: room.participants.length },
    (_, i) => i + 1,
  );
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [seats[i], seats[j]] = [seats[j]!, seats[i]!];
  }
  room.participants.forEach((p, i) => {
    p.seat = seats[i]!;
    p.type =
      p.seat <= counts[0]! ? 1 : p.seat <= counts[0]! + counts[1]! ? 2 : 3;
  });
}
export function act(
  room: Room,
  actor: Actor,
  action: Action,
  now: number,
  random: () => number = Math.random,
) {
  advanceClock(room, now, random);
  if (
    action.kind === "quote" ||
    action.kind === "accept" ||
    action.kind === "cancel"
  ) {
    requireRule(actor.role === "student", "学生として入室してください。");
    requireRule(
      room.status === "trading" && room.pausedAt === null,
      "現在は取引できません。",
    );
    requireRule(
      action.unitKey === unitKey(room),
      "取引が切り替わりました。画面を確認してもう一度操作してください。",
    );
    const p = room.participants.find((p) => p.id === actor.participantId);
    requireRule(p, "参加者が見つかりません。");
    const side = action.side;
    if (action.kind === "cancel") {
      requireRule(
        room[side]?.id === action.quoteId && room[side]?.participantId === p.id,
        "この提示は取り消せません。",
      );
      room[side] = null;
      record(room, "quote-cancelled", p.id, now, { side });
      return;
    }
    if (action.kind === "accept") {
      const quote = room[side];
      requireRule(
        quote?.id === action.quoteId,
        "提示が更新されました。新しい価格を確認してください。",
      );
      requireRule(
        quote.participantId !== p.id,
        "自分の提示とは取引できません。",
      );
      settle(
        room,
        side === "ask" ? p.id : quote.participantId,
        side === "ask" ? quote.participantId : p.id,
        quote.price,
        now,
        random,
      );
      return;
    }
    requireRule(
      Number.isSafeInteger(action.price) &&
        action.price >= 1 &&
        action.price <= 100000,
      "価格は1〜100,000の整数で入力してください。",
    );
    if (side === "ask")
      requireRule(p.holdings > 0, "保有証券がないため売れません。");
    const existing = room[side];
    requireRule(
      !existing ||
        (side === "bid"
          ? action.price > existing.price
          : action.price < existing.price),
      side === "bid"
        ? "現在の買値より高い価格を提示してください。"
        : "現在の売値より低い価格を提示してください。",
    );
    const otherSide: Side = side === "bid" ? "ask" : "bid";
    const opposing = room[otherSide];
    if (
      opposing &&
      (side === "bid"
        ? action.price >= opposing.price
        : action.price <= opposing.price)
    ) {
      requireRule(
        opposing.participantId !== p.id,
        "自分の反対側の提示を取り消してください。",
      );
      record(room, "quote-submitted", p.id, now, {
        side,
        price: action.price,
        year: room.year,
        period: room.period,
        unit: room.unit,
      });
      settle(
        room,
        side === "bid" ? p.id : opposing.participantId,
        side === "bid" ? opposing.participantId : p.id,
        opposing.price,
        now,
        random,
      );
    } else {
      record(room, "quote-submitted", p.id, now, {
        side,
        price: action.price,
        year: room.year,
        period: room.period,
        unit: room.unit,
      });
      room[side] = {
        id: `q${room.revision}`,
        participantId: p.id,
        seat: p.seat!,
        price: action.price,
        at: now,
      };
    }
    return;
  }
  requireRule(actor.role === "teacher", "教員の操作です。");
  requireRule(
    action.expectedPhase === phaseKey(room),
    "進行が更新されました。確認してもう一度操作してください。",
  );
  switch (action.kind) {
    case "start": {
      requireRule(room.status === "lobby", "この実験は開始済みです。");
      requireRule(room.participants.length >= 3, "3人以上の参加者が必要です。");
      if (room.participants.every((p) => p.seat === null && p.type === null)) {
        assignParticipants(room, random);
      }
      const assignedCounts = [1, 2, 3].map(
        (type) => room.participants.filter((p) => p.type === type).length,
      );
      requireRule(
        assignedCounts.every(
          (n, i) =>
            n > 0 &&
            (room.typeCounts === undefined || room.typeCounts[i] === n),
        ) &&
          room.participants.every(
            (p) =>
              Number.isInteger(p.seat) &&
              p.seat! >= 1 &&
              p.seat! <= room.participants.length,
          ) &&
          new Set(room.participants.map((p) => p.seat)).size ===
            room.participants.length,
        "タイプの割り当てを確認してください。",
      );
      beginYear(room, now, random);
      break;
    }
    case "pause":
      requireRule(
        (room.status === "trading" || room.status === "break") &&
          room.pausedAt === null,
        "一時停止できません。",
      );
      room.pausedAt = now;
      break;
    case "resume": {
      requireRule(room.pausedAt !== null, "一時停止していません。");
      const delta = now - room.pausedAt;
      if (room.periodEndsAt !== null) room.periodEndsAt += delta;
      if (room.unitEndsAt !== null) room.unitEndsAt += delta;
      if (room.breakEndsAt !== null) room.breakEndsAt += delta;
      room.pausedAt = null;
      break;
    }
    case "end-period":
      endPeriod(room, now, "teacher", random);
      break;
    case "next-year":
      requireRule(
        room.status === "break" && room.pausedAt === null,
        "休憩中だけ次のラウンドへ進めます。",
      );
      room.year++;
      beginYear(room, now, random);
      break;
    case "reveal":
      requireRule(room.status === "completed", "実験終了後に公開できます。");
      room.reveal = true;
      break;
  }
  record(room, action.kind, "teacher", now);
}
/** Explicit allowlist: private conditions, identities and scores never enter another student's response. */
export function view(room: Room, actor: Actor, now: number): RoomView {
  const teacher = actor.role === "teacher";
  const me =
    actor.role === "student"
      ? room.participants.find((p) => p.id === actor.participantId)
      : undefined;
  const person = (p: Participant) => ({
    id: p.id,
    name: p.name,
    studentId: p.studentId,
    seat: p.seat,
    type: p.type,
    holdings: p.holdings,
    cash: p.cash,
    dividend: p.dividend,
    totalProfit: p.totalProfit,
    dividends: p.type === null ? null : room.config.dividends[p.type - 1]!,
  });
  const visibleResults = room.results.map((result) => {
    if (teacher || room.reveal)
      return {
        ...result,
        payouts: teacher
          ? result.payouts
          : result.payouts.filter((p) => p.participantId === me?.id),
      };
    return {
      ...result,
      payouts: result.payouts.filter((p) => p.participantId === me?.id),
      priceRatio: null,
      actualDividend: 0,
      maxDividend: 0,
      initialDividend: 0,
      allocationEfficiency: 0,
      gainEfficiency: null,
    };
  });
  return {
    code: room.code,
    title: room.config.title,
    revision: room.revision,
    serverNow: now,
    role: actor.role,
    status: room.status,
    year: room.year,
    period: room.period,
    unit: room.unit,
    unitKey: unitKey(room),
    phaseKey: phaseKey(room),
    rounds: room.config.rounds,
    initialUnits: initialUnitsFor(room.config),
    periodSeconds: room.config.periodSeconds,
    unitSeconds: room.config.unitSeconds,
    breakSeconds: room.config.breakSeconds,
    participantCount: room.participants.length,
    nominatedSeat: room.nominatedSeat,
    emptyUnits: room.emptyUnits,
    periodEndsAt: room.periodEndsAt,
    unitEndsAt: room.unitEndsAt,
    breakEndsAt: room.breakEndsAt,
    pausedAt: room.pausedAt,
    bid: room.bid,
    ask: room.ask,
    trades: room.trades,
    me: me ? person(me) : null,
    participants: teacher ? room.participants.map(person) : [],
    results: visibleResults,
    reveal: room.reveal,
    benchmarks: teacher || room.reveal ? benchmarks(room.config) : null,
    conditions: teacher || room.reveal ? room.config.dividends : null,
  };
}
