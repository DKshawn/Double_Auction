import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Command } from "../src/lib/types";
import type { AuditEvent, Participant, Room } from "../src/lib/server/model";
import { execute, settleDeadline, toView } from "../src/lib/server/engine";
import { newStudy, stageKey, unitLimits } from "../src/lib/server/study";
import { csv, exportData } from "../src/lib/server/export";
import {
  studyEquilibrium,
  studyMetrics,
  convergenceSlopes,
} from "../src/lib/server/study-view";

function classroom(count = 1, first: "cda" | "call" | "posted" = "cda") {
  const study = newStudy(count);
  if (count === 1)
    study.markets[0].order = [
      first,
      ...(["cda", "call", "posted"] as const).filter((i) => i !== first),
    ];
  const room: Room = {
    code: "STUDY2",
    study,
    config: {
      title: "実験1",
      protocol: "institutions-v1",
      markets: count,
      capacity: count * 16,
      rounds: 15,
      duration: 180,
    },
    phase: "waiting",
    round: 0,
    version: 1,
    deadline: null,
    remainingMs: 0,
    createdAt: 0,
    teacherTokenHash: "",
    teacherPasswordHash: "",
    teacherFailedLogins: 0,
    teacherLockedUntil: 0,
    seats: [],
    quotes: [],
    trades: [],
    sequence: 0,
    receipts: [],
    participants: [],
  };
  for (let seat = 0; seat < count * 16; seat++)
    room.participants.push({
      id: randomUUID(),
      seat,
      role: seat % 16 < 8 ? "buyer" : "seller",
      alias: `${seat % 16 < 8 ? "買" : "売"}${(seat % 8) + 1}`,
      nickname: `学生${seat + 1}`,
      limits: { apple: 0, banana: 0, orange: 0 },
      tokenHash: "",
      pinHash: "",
      failedLogins: 0,
      lockedUntil: 0,
    });
  const events: AuditEvent[] = [];
  const send = (actor: Participant | "teacher", command: Command, now = 1000) =>
    execute(
      room,
      actor,
      {
        requestId: randomUUID(),
        expectedRound: room.round,
        expectedStage:
          actor === "teacher"
            ? undefined
            : stageKey(room, study.markets[Math.floor(actor.seat / 16)]),
        command,
      },
      now,
      events,
    );
  return {
    room,
    study,
    events,
    send,
    buyers: room.participants.filter((p) => p.role === "buyer"),
    sellers: room.participants.filter((p) => p.role === "seller"),
  };
}

test("study uses 12 balanced markets, six orders twice, and the professor's marginal values", () => {
  const { room, study } = classroom(12);
  const counts = new Map<string, number>();
  for (const market of study.markets)
    counts.set(
      market.order.join(","),
      (counts.get(market.order.join(",")) ?? 0) + 1,
    );
  assert.equal(counts.size, 6);
  assert.ok([...counts.values()].every((n) => n === 2));
  assert.deepEqual(studyEquilibrium(room), {
    low: 80,
    high: 80,
    quantity: 10,
    quantityMax: 11,
    surplus: 440,
  });
  assert.deepEqual(unitLimits(room, room.participants[0]), [120, 104]);
  assert.deepEqual(unitLimits(room, room.participants[8]), [40, 56]);
});

test("CDA trades two marginal units at resting prices, permits losses, and never crosses markets", () => {
  const { room, study, send, buyers, sellers } = classroom(6);
  study.markets.forEach((m) => (m.order = ["cda", "call", "posted"]));
  send("teacher", { type: "start" });
  send(sellers[8], { type: "study-quote", price: 20 });
  send(sellers[0], { type: "study-quote", price: 81 });
  send(buyers[0], { type: "study-quote", price: 100 });
  assert.equal(study.markets[0].trades[0].price, 81);
  assert.equal(study.markets[1].trades.length, 0);
  send(sellers[0], { type: "study-quote", price: 150 });
  send(buyers[0], { type: "study-quote", price: 155 });
  const second = study.markets[0].trades[1];
  assert.equal(second.value, 104);
  assert.equal(second.cost, 56);
  assert.equal(second.price, 150);
  assert.equal(
    toView(room, buyers[0], 1000, "local").me.profit,
    120 - 81 + (104 - 150),
  );
  assert.throws(
    () => send(buyers[0], { type: "study-quote", price: 100 }),
    /2単位/,
  );
  assert.throws(
    () =>
      send(buyers[1], {
        type: "study-accept",
        orderId: study.markets[1].orders[0].id,
      }),
    /最良注文/,
  );
});

test("CDA uses best price then time, rejects stale stages and is idempotent", () => {
  const { room, study, send, buyers, sellers, events } = classroom();
  send("teacher", { type: "start" });
  send(sellers[0], { type: "study-quote", price: 80 });
  send(sellers[1], { type: "study-quote", price: 79 });
  send(sellers[2], { type: "study-quote", price: 79 });
  const req = {
    requestId: randomUUID(),
    expectedRound: 1,
    expectedStage: stageKey(room, study.markets[0]),
    command: { type: "study-quote", price: 85 } as Command,
  };
  execute(room, buyers[0], req, 1000, events);
  execute(room, buyers[0], req, 1000, events);
  assert.equal(study.markets[0].trades.length, 1);
  assert.equal(study.markets[0].trades[0].sellerId, sellers[1].id);
  assert.throws(
    () =>
      execute(
        room,
        buyers[1],
        { ...req, requestId: randomUUID(), expectedStage: "old" },
        1000,
        events,
      ),
    /切り替わりました/,
  );
});

test("Call hides submitted orders, clears all trades at 97.5, expires unfilled orders, and retains period inventory", () => {
  const { room, study, send, buyers, sellers, events } = classroom(1, "call");
  send("teacher", { type: "start" });
  [110, 105, 100, 90].forEach((price, i) =>
    send(buyers[i], { type: "call-submit", prices: [price] }),
  );
  [70, 85, 95, 115].forEach((price, i) =>
    send(sellers[i], { type: "call-submit", prices: [price] }),
  );
  const before = toView(room, buyers[0], 1000, "local");
  assert.equal(before.study!.market.orders.length, 0);
  assert.equal(before.study!.market.myOrders.length, 1);
  assert.equal(before.study!.teacher, undefined);
  assert.equal(before.study!.market.trades.length, 0);
  assert.equal(
    toView(room, "teacher", 1000, "local").study!.market.orders.length,
    0,
  );
  assert.throws(
    () => send(buyers[0], { type: "call-submit", prices: [100] }),
    /送信済み/,
  );
  const oldStage = stageKey(room, study.markets[0]);
  settleDeadline(room, 31000, events);
  assert.equal(study.markets[0].trades.length, 3);
  assert.ok(study.markets[0].trades.every((t) => t.price === 97.5));
  assert.equal(study.markets[0].orders.length, 0);
  assert.equal(study.markets[0].call, 2);
  assert.equal(toView(room, buyers[0], 31000, "local").study!.unitsUsed, 1);
  assert.throws(
    () =>
      execute(
        room,
        buyers[0],
        {
          requestId: randomUUID(),
          expectedRound: 1,
          expectedStage: oldStage,
          command: { type: "call-submit", prices: [100] },
        },
        31000,
        events,
      ),
    /切り替わりました/,
  );
  send(buyers[0], { type: "call-submit", prices: [110] }, 31000);
  send(sellers[0], { type: "call-submit", prices: [90] }, 31000);
  settleDeadline(room, 61000, events);
  assert.equal(study.markets[0].trades.at(-1)!.buyerUnit, 2);
  assert.equal(study.markets[0].trades.at(-1)!.value, 104);
  settleDeadline(room, 121000, events);
  assert.equal(room.phase, "review");
  assert.equal(study.markets[0].clearings.length, 4);
  assert.equal(study.markets[0].clearings.at(-1)!.price, null);
});

test("truthful two-unit Call schedules clear 11 units at 80 for surplus 440, without leaking values", () => {
  const { room, study, send, buyers, sellers, events } = classroom(1, "call");
  send("teacher", { type: "start" });
  for (const p of [...buyers, ...sellers])
    send(p, { type: "call-submit", prices: unitLimits(room, p) });
  settleDeadline(room, 31000, events);
  assert.equal(study.markets[0].trades.length, 11);
  assert.ok(study.markets[0].trades.every((t) => t.price === 80));
  const metrics = studyMetrics(room, 31000)[0];
  assert.equal(metrics.surplus, 440);
  assert.equal(metrics.efficiency, 100);
  assert.equal(metrics.quantityRatio, 1.1);
  assert.equal(metrics.alpha, 0);
  const student = toView(room, buyers[0], 31000, "local");
  assert.equal(student.study!.teacher, undefined);
  for (const trade of student.study!.market.trades) {
    assert.equal("value" in trade, false);
    assert.equal("cost" in trade, false);
  }
  assert.deepEqual(student.study!.unitLimits, [120, 104]);
});

test("Posted Offer locks offers, hides them before 60s and enforces random buyer turns and stock", () => {
  const { room, study, send, buyers, sellers, events } = classroom(1, "posted");
  send("teacher", { type: "start" });
  send(sellers[0], { type: "posted-offer", price: 90, quantity: 2 });
  assert.throws(
    () => send(sellers[0], { type: "posted-offer", price: 80, quantity: 2 }),
    /1回/,
  );
  assert.equal(
    toView(room, buyers[0], 1000, "local").study!.market.offers.length,
    0,
  );
  settleDeadline(room, 61000, events);
  const m = study.markets[0];
  assert.equal(new Set(m.buyerOrder).size, 8);
  assert.equal(m.offers[0].remaining, 2);
  const first = buyers.find((p) => p.id === m.buyerOrder[0])!,
    other = buyers.find((p) => p.id !== first.id)!;
  assert.throws(
    () =>
      send(
        other,
        { type: "posted-buy", offerId: m.offers[0].id, quantity: 1 },
        61000,
      ),
    /あなたの購入時間/,
  );
  send(
    first,
    { type: "posted-buy", offerId: m.offers[0].id, quantity: 2 },
    61000,
  );
  assert.equal(m.trades.length, 2);
  assert.equal(m.offers[0].remaining, 0);
  assert.equal(m.buyerIndex, 1);
  assert.equal(
    toView(room, other, 61000, "local").study!.market.offers.length,
    0,
  );
  settleDeadline(room, 141000, events);
  assert.equal(room.phase, "review");
  assert.equal(m.periods[0].completion, "complete");
});

test("pause freezes substage timers, deadlines catch up without browsers, and next periods reset inventory only", () => {
  const { room, study, send, events } = classroom(1, "call");
  send("teacher", { type: "start" });
  send("teacher", { type: "pause" }, 11000);
  settleDeadline(room, 90000, events);
  assert.equal(study.markets[0].call, 1);
  send("teacher", { type: "resume" }, 100000);
  assert.equal(study.markets[0].deadline, 120000);
  settleDeadline(room, 210000, events);
  assert.equal(study.markets[0].clearings.length, 4);
  assert.equal(room.phase, "review");
  send("teacher", { type: "start" }, 220000);
  assert.equal(room.round, 2);
  assert.equal(study.markets[0].call, 1);
  assert.equal(study.markets[0].orders.length, 0);
});

test("15 periods switch institutions every 5 periods, and interrupted periods are excluded from slopes", () => {
  const { room, study, send, events } = classroom();
  for (let period = 1; period <= 15; period++) {
    send("teacher", { type: "start" }, period * 300000);
    settleDeadline(room, period * 300000 + 200000, events);
    assert.equal(
      study.markets[0].periods.at(-1)!.institution,
      ["cda", "call", "posted"][Math.floor((period - 1) / 5)],
    );
  }
  assert.equal(room.phase, "finished");
  assert.equal(studyMetrics(room, 5000000).length, 15);
  assert.ok(
    convergenceSlopes(studyMetrics(room, 5000000)).every(
      (s) => s.n === 0 && s.slope === null,
    ),
  );
});

test("negative-surplus trades are counted; settings lock after start and student teacher actions are denied", () => {
  const { room, study, send, buyers, sellers } = classroom();
  assert.throws(() => send(buyers[0], { type: "start" }), /教員のみ/);
  send("teacher", { type: "start" });
  send(sellers[7], { type: "study-quote", price: 80 });
  send(buyers[7], { type: "study-quote", price: 80 });
  const metric = studyMetrics(room, 1000)[0];
  assert.equal(metric.inefficientTrades, 1);
  assert.equal(metric.surplus, -8);
  assert.throws(
    () =>
      send("teacher", {
        type: "study-settings",
        settings: study.settings,
        expectedRevision: 0,
      }),
    /開始前/,
  );
  send("teacher", { type: "end-round" });
  assert.equal(studyMetrics(room, 1000)[0].completion, "interrupted");
});

test("CDA spread is weighted by observed book time and excludes pauses and one-sided books", () => {
  const { room, send, buyers, sellers, events } = classroom();
  send("teacher", { type: "start" });
  send(buyers[0], { type: "study-quote", price: 60 }, 2000);
  send(sellers[0], { type: "study-quote", price: 100 }, 3000);
  send("teacher", { type: "pause" }, 8000);
  assert.equal(studyMetrics(room, 90000)[0].spreadObservedMs, 5000);
  send("teacher", { type: "resume" }, 100000);
  send(sellers[0], { type: "study-quote", price: 80 }, 105000);
  send(buyers[0], { type: "study-cancel" }, 115000);
  settleDeadline(room, 300000, events);
  const metric = studyMetrics(room, 300000)[0];
  assert.equal(metric.spreadObservedMs, 20000);
  assert.equal(metric.spread, 30);
});

test("Call rejects non-monotone schedules and cancels unfilled orders on early ending", () => {
  const { room, study, send, buyers, sellers } = classroom(1, "call");
  send("teacher", { type: "start" });
  assert.throws(
    () => send(buyers[0], { type: "call-submit", prices: [80, 100] }),
    /2単位目/,
  );
  assert.equal(study.markets[0].orders.length, 0);
  send(buyers[0], { type: "call-submit", prices: [100, 100] });
  send(sellers[0], { type: "call-submit", prices: [80, 80] });
  send("teacher", { type: "end-round" });
  assert.equal(study.markets[0].trades.length, 0);
  assert.equal(study.markets[0].orders.length, 0);
  assert.equal(studyMetrics(room, 1000)[0].completion, "interrupted");
});

test("research exports preserve negative numeric profits, protocol assumptions and private teacher data without credentials", () => {
  const { room, send, buyers, sellers, events } = classroom();
  room.teacherTokenHash = "SECRET-TEACHER-TOKEN-HASH";
  buyers[0].pinHash = "SECRET-STUDENT-PIN-HASH";
  send("teacher", { type: "start" });
  send(sellers[0], { type: "study-quote", price: 150 });
  send(buyers[0], { type: "study-quote", price: 150 });
  const trades = exportData(room, events, 1000, "trades").content;
  assert.ok(trades.includes('"-30"'));
  assert.ok(!trades.includes('"\'-30"'));
  assert.ok(csv([["=HYPERLINK()", -30]]).includes('"\'=HYPERLINK()","-30"'));
  for (const kind of ["settings", "trades", "events", "metrics"]) {
    const data = exportData(room, events, 1000, kind).content;
    assert.ok(!data.includes("SECRET-"));
  }
  const settings = JSON.parse(
    exportData(room, events, 1000, "settings").content,
  );
  assert.equal(settings.rules.unitsPerPeriod, 2);
  assert.equal(settings.equilibrium.quantityMax, 11);
  assert.deepEqual(settings.markets[0].order, ["cda", "call", "posted"]);
});

test("convergence slope uses institution-local periods and omits interrupted and no-trade periods", () => {
  const { room, study, send, buyers, sellers, events } = classroom();
  for (let i = 1; i <= 5; i++) {
    const start = i * 300000;
    send("teacher", { type: "start" }, start);
    if (i !== 4) {
      send(sellers[0], { type: "study-quote", price: 120 - 8 * i }, start + 10);
      send(buyers[0], { type: "study-quote", price: 120 }, start + 20);
    }
    if (i === 3) send("teacher", { type: "end-round" }, start + 30);
    else settleDeadline(room, start + 200000, events);
  }
  assert.equal(study.markets[0].periods.length, 5);
  const slope = convergenceSlopes(studyMetrics(room, 2000000))[0];
  assert.equal(slope.n, 3);
  assert.ok(Math.abs(slope.slope! + 0.1) < 1e-10);
});

test("mixed institutions finish independently and a global pause never restarts completed markets", () => {
  const { room, study, send, events } = classroom(6);
  send("teacher", { type: "start" }, 1000);
  settleDeadline(room, 121000, events);
  assert.equal(study.markets.filter((m) => m.stage === "done").length, 2);
  assert.equal(room.phase, "running");
  assert.throws(
    () => send("teacher", { type: "start" }, 121000),
    /開始できません/,
  );
  send("teacher", { type: "pause" }, 121000);
  send("teacher", { type: "resume" }, 200000);
  settleDeadline(room, 220000, events);
  assert.equal(study.markets.filter((m) => m.stage === "done").length, 4);
  assert.equal(room.phase, "running");
  settleDeadline(room, 260000, events);
  assert.equal(room.phase, "review");
  assert.ok(study.markets.every((m) => m.periods[0].completion === "complete"));
  assert.equal(studyMetrics(room, 260000).length, 6);
});
