import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { commandSchema } from "../src/lib/server/http";
import type { Room } from "../src/lib/server/model";
import type { Command, RoomView } from "../src/lib/types";

let pg: PGlite, db: Database, service: AuctionService;
before(async () => {
  pg = new PGlite();
  db = localDatabase(pg);
  await migrate(db);
  service = new AuctionService(db);
});
after(async () => {
  await pg.close();
});

async function classroom(markets = 1) {
  const teacher = await service.create(
    {
      title: "実験1テスト",
      protocol: "institutions-v1",
      markets,
      capacity: markets * 16,
      rounds: 15,
      duration: 180,
    },
    "Test-Teacher-2026",
    "",
  );
  const students: { token: string; view: RoomView }[] = [];
  for (let i = 0; i < markets * 16; i++) {
    const login = await service.join(teacher.code, `学生${i + 1}`, "123456");
    students.push({
      token: login.token,
      view: await service.view(teacher.code, login.token),
    });
  }
  const send = async (token: string, command: Command) => {
    const view = await service.view(teacher.code, token);
    return service.command(teacher.code, token, {
      requestId: randomUUID(),
      expectedRound: view.round,
      expectedStage: view.study!.market.stageKey,
      command,
    });
  };
  return { teacher, students, send };
}

test("96 students receive six isolated balanced markets and six distinct institution orders", async () => {
  const { teacher, students } = await classroom(6);
  const view = await service.view(teacher.code, teacher.token);
  assert.equal(view.study!.teacher!.markets.length, 6);
  assert.equal(
    new Set(view.study!.teacher!.markets.map((m) => m.order.join())).size,
    6,
  );
  for (let id = 1; id <= 6; id++) {
    const group = students.filter((p) => p.view.study!.market.id === id);
    assert.equal(group.length, 16);
    assert.equal(group.filter((p) => p.view.me.role === "buyer").length, 8);
    assert.equal(new Set(group.map((p) => p.view.me.alias)).size, 16);
  }
  await assert.rejects(
    service.export(teacher.code, students[0].token),
    /教員のみ/,
  );
});

test("study settings update existing students, reject stale revisions and concurrent accepts fill only once", async () => {
  const { teacher, students, send } = await classroom();
  const initial = await service.view(teacher.code, teacher.token);
  const settings = initial.study!.teacher!.settings;
  settings.values[0] = [130, 110];
  await send(teacher.token, {
    type: "study-settings",
    settings,
    expectedRevision: 0,
  });
  await assert.rejects(
    send(teacher.token, {
      type: "study-settings",
      settings,
      expectedRevision: 0,
    }),
    /更新/,
  );
  const buyers = students.filter((s) => s.view.me.role === "buyer");
  const b1 = buyers.find((s) => s.view.me.alias === "買01")!;
  assert.deepEqual(
    (await service.view(teacher.code, b1.token)).study!.unitLimits,
    [130, 110],
  );
  await send(teacher.token, { type: "start" });
  const seller = students.find((s) => s.view.me.role === "seller")!;
  const offer = await send(seller.token, { type: "study-quote", price: 80 });
  const orderId = offer.study!.market.orders[0].id;
  const results = await Promise.allSettled(
    buyers
      .slice(0, 2)
      .map((b) => send(b.token, { type: "study-accept", orderId })),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await service.view(teacher.code, teacher.token)).study!.market.trades
      .length,
    1,
  );
  await assert.rejects(
    send(teacher.token, {
      type: "study-settings",
      settings,
      expectedRevision: 1,
    }),
    /開始前/,
  );
});

test("export atomically clears expired Call orders without a polling browser, including all audit trades", async () => {
  const { teacher, students, send } = await classroom();
  const snapshot = await service.export(teacher.code, teacher.token);
  snapshot.room.study!.markets[0].order = ["call", "cda", "posted"];
  await db.query("UPDATE auction_rooms SET state = $2::jsonb WHERE code = $1", [
    teacher.code,
    JSON.stringify(snapshot.room),
  ]);
  await send(teacher.token, { type: "start" });
  for (const p of students)
    await send(p.token, {
      type: "call-submit",
      prices: p.view.study!.unitLimits!,
    });
  const stored = await db.query<{ state: Room }>(
    "SELECT state FROM auction_rooms WHERE code = $1",
    [teacher.code],
  );
  const room = stored.rows[0].state;
  const deadline = Date.now() - 1;
  room.deadline = deadline;
  room.study!.markets[0].deadline = deadline;
  await db.query("UPDATE auction_rooms SET state = $2::jsonb WHERE code = $1", [
    teacher.code,
    JSON.stringify(room),
  ]);
  const exported = await service.export(teacher.code, teacher.token);
  assert.equal(exported.room.study!.markets[0].trades.length, 11);
  assert.equal(exported.events.filter((e) => e.type === "trade").length, 11);
  assert.equal(exported.room.study!.markets[0].call, 2);
  const again = await service.export(teacher.code, teacher.token);
  assert.equal(again.events.length, exported.events.length);
});

test("zero-unit Call requests pass API validation, persist across reloads and log abstention exactly once", async () => {
  const { teacher, students, send } = await classroom();
  const snapshot = await service.export(teacher.code, teacher.token);
  snapshot.room.study!.markets[0].order = ["call", "cda", "posted"];
  await db.query("UPDATE auction_rooms SET state = $2::jsonb WHERE code = $1", [
    teacher.code,
    JSON.stringify(snapshot.room),
  ]);
  await send(teacher.token, { type: "start" });
  const student = students.find((p) => p.view.me.role === "buyer")!;
  const view = await service.view(teacher.code, student.token);
  const request = commandSchema.parse({
    requestId: randomUUID(),
    expectedRound: view.round,
    expectedStage: view.study!.market.stageKey,
    command: { type: "call-submit", prices: [] },
  });
  await service.command(teacher.code, student.token, request);
  await service.command(teacher.code, student.token, request);
  const reloaded = await new AuctionService(db).view(
    teacher.code,
    student.token,
  );
  assert.equal(reloaded.study!.market.submitted, true);
  assert.deepEqual(reloaded.study!.market.myOrders, []);
  assert.equal(reloaded.study!.unitsUsed, 0);
  await assert.rejects(
    send(student.token, { type: "call-submit", prices: [80] }),
    /送信済み/,
  );
  const exported = await service.export(teacher.code, teacher.token);
  const passes = exported.events.filter((e) => e.type === "call-pass");
  assert.equal(passes.length, 1);
  assert.equal(passes[0].actor, student.view.me.id);
  assert.equal(passes[0].round, 1);
  assert.equal(passes[0].detail.call, 1);
  assert.equal(passes[0].detail.quantity, 0);
  assert.equal(exported.room.study!.markets[0].orders.length, 0);
});

test("teacher opens admission before anyone joins; each full market starts once and late arrivals begin in period one", async () => {
  const teacher = await service.create(
    {
      title: "独立進行",
      protocol: "institutions-v1",
      markets: 6,
      capacity: 96,
      rounds: 15,
      duration: 180,
    },
    "Test-Teacher-2026",
    "",
  );
  const snapshot = await service.export(teacher.code, teacher.token);
  snapshot.room.seats = Array.from({ length: 96 }, (_, i) => i);
  snapshot.room.study!.markets[0].order = ["cda", "call", "posted"];
  snapshot.room.study!.markets[1].order = ["call", "cda", "posted"];
  await db.query("UPDATE auction_rooms SET state = $2::jsonb WHERE code = $1", [
    teacher.code,
    JSON.stringify(snapshot.room),
  ]);
  const opened = await service.command(teacher.code, teacher.token, {
    requestId: randomUUID(),
    expectedRound: 0,
    command: { type: "start" },
  });
  assert.equal(opened.phase, "running");
  assert.equal(opened.deadline, null);
  assert.ok(opened.study!.teacher!.markets.every((m) => m.round === 0));
  for (let i = 0; i < 15; i++)
    await service.join(teacher.code, `先着${i}`, "123456");
  assert.equal(
    (await service.view(teacher.code, teacher.token)).study!.market.round,
    0,
  );
  await service.join(teacher.code, "16人目", "123456");
  const started = await service.export(teacher.code, teacher.token);
  assert.equal(started.room.study!.markets[0].round, 1);
  assert.equal(
    started.events.filter((e) => e.type === "period-started").length,
    1,
  );
  started.room.deadline = Date.now() - 10;
  started.room.study!.markets[0].deadline = started.room.deadline;
  await db.query("UPDATE auction_rooms SET state = $2::jsonb WHERE code = $1", [
    teacher.code,
    JSON.stringify(started.room),
  ]);
  assert.equal(
    (await service.view(teacher.code, teacher.token)).study!.market.round,
    2,
  );
  let buyerToken = "";
  for (let i = 0; i < 16; i++) {
    const joined = await service.join(teacher.code, `後着${i}`, "123456");
    if (!i) buyerToken = joined.token;
  }
  const buyer = await service.view(teacher.code, buyerToken);
  assert.equal(buyer.round, 1);
  assert.equal(buyer.study!.market.id, 2);
  const submitted = await service.command(teacher.code, buyerToken, {
    requestId: randomUUID(),
    expectedRound: 1,
    expectedStage: buyer.study!.market.stageKey,
    command: { type: "call-submit", prices: [90, 80] },
  });
  assert.equal(submitted.study!.market.submitted, true);
  assert.equal(submitted.study!.market.round, 1);
  const final = await service.export(teacher.code, teacher.token);
  assert.equal(final.room.study!.markets[2].round, 0);
  assert.equal(
    final.events.filter(
      (e) => e.type === "period-started" && e.detail.market === 2,
    ).length,
    1,
  );
  assert.equal(final.events.findLast((e) => e.type === "call-order")!.round, 1);
  assert.ok(
    final.events
      .filter((e) => e.type === "joined" && e.detail.market === 2)
      .every((e) => e.round === 0),
  );
  await service.join(teacher.code, "後着0", "123456", buyerToken);
  const rejoined = await service.export(teacher.code, teacher.token);
  assert.equal(rejoined.events.at(-1)!.type, "rejoined");
  assert.equal(rejoined.events.at(-1)!.round, 1);
  assert.ok(
    final.room.study!.markets[1].periods[0].startedAt >
      final.room.study!.markets[0].periods[0].startedAt,
  );
});
