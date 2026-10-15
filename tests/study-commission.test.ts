import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PGlite } from "@electric-sql/pglite";
import { TeacherForm } from "../src/components/teacher-form";
import { StudyRoom } from "../src/components/study-room";
import { StudyTradeFeedback } from "../src/components/study-personal-trades";
import {
  DEFAULT_STUDY_COMMISSION,
  studyCommission,
  studyUnitProfit,
} from "../src/lib/study-commission";
import { execute, settleDeadline, toView } from "../src/lib/server/engine";
import {
  newStudy,
  marketFor,
  stageKey,
  marketRound,
  studyProfit,
} from "../src/lib/server/study";
import { studyMetrics, studyEquilibrium } from "../src/lib/study-view";
import { commandSchema, createRoomSchema } from "../src/lib/server/http";
import { exportData } from "../src/lib/server/export";
import { localDatabase, migrate } from "../src/lib/server/database";
import { lockBundle, saveBundle } from "../src/lib/server/market-store";
import { AuctionService } from "../src/lib/server/service";
import { studyRole } from "../src/lib/study-config";
import type { Room, Participant, AuditEvent } from "../src/lib/auction-model";
import type { Command, RoomConfig, CommandRequest } from "../src/lib/types";
import type { Institution } from "../src/lib/study-types";

function fixture(institution: Institution = "cda", commission?: number) {
  const config: RoomConfig = {
    protocol: "institutions-v1",
    title: "Commissionテスト",
    markets: 1,
    marketSize: 4,
    capacity: 4,
    studyInstitutions: [institution],
    studyPeriods: { [institution]: 1 },
    rounds: 1,
    duration: 180,
    ...(commission === undefined ? {} : { studyCommission: commission }),
  };
  const room: Room = {
    config,
    study: newStudy(1, 4, [institution]),
    code: "BONUS2",
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
    seats: [0, 1, 2, 3],
    quotes: [],
    trades: [],
    sequence: 0,
    receipts: [],
    participants: [],
  };
  room.study!.settings = {
    values: [
      [80, 80],
      [80, 80],
    ],
    costs: [
      [80, 80],
      [80, 80],
    ],
  };
  for (let seat = 0; seat < 4; seat++)
    room.participants.push({
      id: randomUUID(),
      seat,
      role: studyRole(config, seat),
      alias: String(seat),
      nickname: String(1000000 + seat),
      limits: { apple: 0, banana: 0, orange: 0 },
      tokenHash: "",
      pinHash: "",
      failedLogins: 0,
      lockedUntil: 0,
    });
  const events: AuditEvent[] = [];
  const send = (
    actor: Participant | "teacher",
    command: Command,
    at = 1000,
  ) => {
    const request: CommandRequest = {
      requestId: randomUUID(),
      expectedRound:
        actor === "teacher"
          ? room.round
          : marketRound(room, marketFor(room, actor)),
      expectedStage:
        actor === "teacher"
          ? undefined
          : stageKey(room, marketFor(room, actor)),
      command,
    };
    execute(room, actor, request, at, events);
    return request;
  };
  return {
    room,
    events,
    send,
    buyers: room.participants.slice(0, 2),
    sellers: room.participants.slice(2),
    market: room.study!.markets[0],
  };
}

test("commission accepts zero and integers only, with default 1 on the creation form and 0 on old configs", () => {
  const { room } = fixture();
  assert.equal(studyCommission(room.config), 0);
  const markup = renderToStaticMarkup(
    createElement(TeacherForm, {
      status: { mode: "local", ready: true, keyRequired: false },
      initialConfig: {
        ...room.config,
        studyCommission: DEFAULT_STUDY_COMMISSION,
      },
    }),
  );
  assert.match(markup, /name="studyCommission"[^>]*value="1"/);
  for (const amount of [0, 5, 999]) {
    assert.ok(
      createRoomSchema.safeParse({
        config: { ...room.config, studyCommission: amount },
        password: "Local-test-only",
      }).success,
    );
    assert.ok(
      commandSchema.safeParse({
        requestId: randomUUID(),
        expectedRound: 0,
        command: {
          type: "study-commission",
          expectedRevision: 0,
          commission: amount,
        },
      }).success,
    );
  }
  for (const amount of [-1, 0.5, 1000, NaN, Infinity]) {
    assert.equal(
      createRoomSchema.safeParse({
        config: { ...room.config, studyCommission: amount },
        password: "Local-test-only",
      }).success,
      false,
    );
    assert.equal(
      commandSchema.safeParse({
        requestId: randomUUID(),
        expectedRound: 0,
        command: {
          type: "study-commission",
          expectedRevision: 0,
          commission: amount,
        },
      }).success,
      false,
    );
  }
  assert.equal(studyUnitProfit("buyer", 80, 80, 5), 5);
  assert.equal(studyUnitProfit("seller", 80, 80, 5), 5);
  assert.equal(studyUnitProfit("buyer", 80, 82, 5), 3);
  assert.equal(studyUnitProfit("seller", 80, 78, 5), 3);
});

test("CDA rewards each party per filled unit, never on quotes/cancels/expiry, and duplicate receipts do not double-pay", () => {
  const { room, market, send, events, buyers, sellers } = fixture("cda", 5);
  send("teacher", { type: "start" });
  send(sellers[1], { type: "study-quote", price: 90 });
  send(sellers[1], { type: "study-cancel" });
  assert.equal(studyProfit(room, sellers[1]), 0);
  for (let unit = 1; unit <= 2; unit++) {
    send(sellers[0], { type: "study-quote", price: 80 });
    const request = send(buyers[0], {
      type: "study-accept",
      orderId: market.orders[0].id,
    });
    execute(room, buyers[0], request, 1000, events);
    for (const person of [buyers[0], sellers[0]]) {
      const view = toView(room, person, 1000, "local");
      assert.equal(view.me.profit, 5 * unit);
      assert.equal(view.me.roundProfit, 5 * unit);
      assert.equal(view.study!.myTrades.length, unit);
      assert.ok(
        view.study!.myTrades.every((t) => t.profit === 5 && t.commission === 5),
      );
    }
    assert.equal(market.trades.length, unit);
  }
  assert.equal(events.filter((e) => e.type === "trade").length, 2);
  assert.ok(market.trades.every((t) => t.commission === 5));
  const metric = studyMetrics(room, 1000)[0];
  assert.equal(metric.surplus, 0);
  assert.equal(metric.commissionPaid, 20);
  assert.equal(metric.efficiency, null);
  send(buyers[1], { type: "study-quote", price: 70 });
  settleDeadline(room, market.deadline!, events);
  assert.equal(studyProfit(room, buyers[1]), 0);
  assert.equal(studyProfit(room, sellers[1]), 0);
  assert.equal(market.trades.length, 2);
  // Even a direct fixture config change must not rewrite already-earned rewards.
  room.config.studyCommission = 999;
  assert.equal(studyProfit(room, buyers[0]), 10);
});

test("Call pays per unit after clearing, preserves half-yen profits and does not reward unfilled submissions", () => {
  for (const bid of [80, 81]) {
    const { room, market, send, events, buyers, sellers } = fixture("call", 5);
    send("teacher", { type: "start" });
    send(buyers[0], { type: "call-submit", prices: [bid, bid] });
    send(sellers[0], { type: "call-submit", prices: [80, 80] });
    send(buyers[1], { type: "call-submit", prices: [70] });
    assert.equal(studyProfit(room, buyers[0]), 0);
    settleDeadline(room, market.deadline!, events);
    assert.equal(market.trades.length, 2);
    assert.equal(studyProfit(room, buyers[0]), bid === 80 ? 10 : 9);
    assert.equal(studyProfit(room, sellers[0]), bid === 80 ? 10 : 11);
    assert.equal(studyProfit(room, buyers[1]), 0);
    assert.equal(studyMetrics(room, 31000)[0].commissionPaid, 20);
    assert.equal(market.clearings[0].price, (bid + 80) / 2);
  }
});

test("Posted Offer two-unit purchases reward both sides twice, offers and passes earn nothing", () => {
  const { room, market, send, events, buyers, sellers } = fixture("posted", 5);
  send("teacher", { type: "start" });
  send(sellers[0], { type: "posted-offer", price: 80, quantity: 2 });
  send(sellers[1], { type: "posted-offer", price: 90, quantity: 1 });
  assert.equal(studyProfit(room, sellers[0]), 0);
  settleDeadline(room, market.deadline!, events);
  const buyer = buyers.find((p) => p.id === market.buyerOrder[0])!;
  send(
    buyer,
    { type: "posted-buy", offerId: market.offers[0].id, quantity: 2 },
    62000,
  );
  assert.equal(studyProfit(room, buyer), 10);
  assert.equal(studyProfit(room, sellers[0]), 10);
  const next = buyers.find(
    (p) => p.id === market.buyerOrder[market.buyerIndex],
  )!;
  send(next, { type: "posted-pass" }, 62001);
  assert.equal(studyProfit(room, next), 0);
  assert.equal(studyProfit(room, sellers[1]), 0);
});

test("commission editing enforces teacher access, revision checks, validation and the start lock", () => {
  const { room, send, buyers, events } = fixture();
  for (const amount of [-1, 0.5, 1000])
    assert.throws(
      () =>
        send("teacher", {
          type: "study-commission",
          expectedRevision: 0,
          commission: amount,
        }),
      /Commission/,
    );
  assert.throws(
    () =>
      send(buyers[0], {
        type: "study-commission",
        expectedRevision: 0,
        commission: 5,
      }),
    /教員/,
  );
  send("teacher", {
    type: "study-commission",
    expectedRevision: 0,
    commission: 7,
  });
  assert.equal(room.config.studyCommission, 7);
  assert.equal(room.study!.revision, 1);
  assert.throws(
    () =>
      send("teacher", {
        type: "study-commission",
        expectedRevision: 0,
        commission: 8,
      }),
    /更新/,
  );
  assert.equal(
    events.find((e) => e.type === "study-commission")!.detail.commission,
    7,
  );
  send("teacher", { type: "start" });
  for (const state of ["running", "paused", "finished"] as const) {
    room.phase = state;
    assert.throws(
      () =>
        send("teacher", {
          type: "study-commission",
          expectedRevision: 1,
          commission: 9,
        }),
      /開始前/,
    );
    assert.equal(room.config.studyCommission, 7);
  }
});

test("old room/trade accounting stays at zero commission and supply benchmarks remain unchanged", () => {
  const { room, send, market, buyers, sellers } = fixture();
  room.study!.settings = newStudy(1, 16).settings;
  assert.deepEqual(studyEquilibrium(room), {
    low: 80,
    high: 80,
    quantity: 10,
    quantityMax: 11,
    surplus: 440,
  });
  room.config.studyCommission = 5;
  assert.equal(studyEquilibrium(room).surplus, 440);
  delete room.config.studyCommission;
  send("teacher", { type: "start" });
  send(sellers[0], { type: "study-quote", price: 80 });
  send(buyers[0], { type: "study-quote", price: 80 });
  assert.equal(market.trades[0].commission, 0);
  delete market.trades[0].commission;
  room.config.studyCommission = 99;
  assert.equal(studyProfit(room, buyers[0]), 40);
  assert.equal(studyProfit(room, sellers[0]), 40);
});

test("student conditions, expected profit, feedback and exports agree on commission-inclusive rewards", () => {
  const { room, market, send, buyers, sellers, events } = fixture("posted", 5);
  send("teacher", { type: "start" });
  send(sellers[0], { type: "posted-offer", price: 80, quantity: 2 });
  settleDeadline(room, market.deadline!, events);
  const buyer = buyers.find((p) => p.id === market.buyerOrder[0])!;
  const props = {
    command: async () => true,
    disabled: false,
    connected: true,
    error: "",
    notice: "",
    retry: () => {},
    demo: true,
  };
  const html = renderToStaticMarkup(
    createElement(StudyRoom, {
      ...props,
      view: toView(room, buyer, 61000, "local"),
      now: 61000,
    }),
  );
  assert.match(html, /Commission 5 円／単位/);
  assert.match(html, /利益 5 円/);
  assert.match(html, /利益 10 円/);
  send(
    buyer,
    { type: "posted-buy", offerId: market.offers[0].id, quantity: 2 },
    62000,
  );
  const view = toView(room, buyer, 62000, "local");
  const feedback = renderToStaticMarkup(
    createElement(StudyTradeFeedback, {
      trades: view.study!.myTrades,
      buyer: true,
      feedbackRound: 1,
    }),
  );
  assert.match(feedback, /利益 10 円/);
  assert.match(feedback, /Commission 10 円込み/);
  const snapshot = JSON.parse(
    exportData(room, events, 62000, "settings").content,
  );
  assert.equal(snapshot.rules.commission, 5);
  assert.equal(
    snapshot.rules.commissionBasis,
    "per-filled-unit-per-participant",
  );
  assert.equal(snapshot.metrics[0].commissionPaid, 20);
  const csv = exportData(room, events, 62000, "trades").content;
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.slice(1, -1)));
  const col = (name: string) => lines[0].indexOf(name);
  for (const row of lines.slice(1)) {
    assert.equal(Number(row[col("買い手利益_円")]), 5);
    assert.equal(Number(row[col("売り手利益_円")]), 5);
    assert.equal(Number(row[col("実現余剰_円")]), 0);
    assert.equal(Number(row[col("Commission_片側1単位_円")]), 5);
  }
});

test("local service persists creation and pre-start edits across reloads and markets, then saves each payout exactly once", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    let service = new AuctionService(db);
    const config = {
      ...fixture("cda", 5).room.config,
      markets: 2,
      marketSize: 2,
      capacity: 4,
    };
    await assert.rejects(
      service.create({ ...config, studyCommission: -1 }, "Local-Test-Only", ""),
      /Commission/,
    );
    const teacher = await service.create(config, "Local-Test-Only", "");
    const send = async (token: string, command: Command) => {
      const view = await service.view(teacher.code, token);
      const request = {
        requestId: randomUUID(),
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        command,
      };
      await service.command(teacher.code, token, request);
      return request;
    };
    const logins = [];
    for (let i = 0; i < 4; i++)
      logins.push(
        await service.join(teacher.code, String(1000000 + i), "1234"),
      );
    await assert.rejects(
      send(logins[0].token, {
        type: "study-commission",
        expectedRevision: 0,
        commission: 7,
      }),
      /教員/,
    );
    await send(teacher.token, {
      type: "study-commission",
      expectedRevision: 0,
      commission: 7,
    });
    service = new AuctionService(db);
    for (const login of logins)
      assert.equal(
        (await service.view(teacher.code, login.token)).config.studyCommission,
        7,
      );
    await send(teacher.token, {
      type: "study-settings",
      expectedRevision: 1,
      settings: { values: [[80, 80]], costs: [[80, 80]] },
    });
    await send(teacher.token, { type: "study-randomize", expectedRevision: 0 });
    await send(teacher.token, { type: "start" });
    await assert.rejects(
      send(teacher.token, {
        type: "study-commission",
        expectedRevision: 2,
        commission: 9,
      }),
      /開始前/,
    );
    const fixtureState = await service.export(teacher.code, teacher.token);
    const room = fixtureState.room;
    for (const market of room.study!.markets) market.deadline = Date.now() - 1;
    room.deadline = Date.now() - 1;
    await db.transaction(async (tx) => {
      const bundle = await lockBundle(tx, room.code, undefined, true);
      await saveBundle(tx, bundle, room, []);
    });
    const students = await Promise.all(
      logins.map(async (login) => ({
        ...login,
        view: await service.view(teacher.code, login.token),
      })),
    );
    const buyer = students.find((s) => s.view.me.role === "buyer")!;
    const seller = students.find(
      (s) =>
        s.view.me.role === "seller" &&
        s.view.study!.market.id === buyer.view.study!.market.id,
    )!;
    await send(seller.token, { type: "study-quote", price: 80 });
    const buy = await send(buyer.token, { type: "study-quote", price: 80 });
    await service.command(teacher.code, buyer.token, buy);
    service = new AuctionService(db);
    for (const student of [buyer, seller]) {
      const view = await service.view(teacher.code, student.token);
      assert.equal(view.me.profit, 7);
      assert.equal(view.study!.myTrades[0].commission, 7);
      assert.equal(view.study!.market.trades.length, 1);
    }
    const saved = await service.export(teacher.code, teacher.token);
    assert.equal(saved.room.study!.markets.flatMap((m) => m.trades).length, 1);
    assert.equal(saved.events.filter((e) => e.type === "trade").length, 1);
    assert.equal(
      saved.events.find((e) => e.type === "study-commission")!.detail
        .commission,
      7,
    );
  } finally {
    await pg.close();
  }
});
