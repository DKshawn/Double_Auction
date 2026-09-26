import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { GOODS } from "../src/lib/catalog";
import type { Command, CommandRequest, RoomView } from "../src/lib/types";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { equilibrium, schedules } from "../src/lib/server/experiment";
import { csv, exportData } from "../src/lib/server/export";

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

type Student = { token: string; view: RoomView };
async function classroom(start = true, capacity = 12) {
  const teacher = await service.create(
    { title: "テスト実験", capacity, rounds: 3, duration: 180 },
    "test-teacher-password",
    "",
  );
  const students: Student[] = [];
  for (let i = 0; i < capacity; i++) {
    const joined = await service.join(teacher.code, `学生${i + 1}`, "123456");
    students.push({
      token: joined.token,
      view: await service.view(teacher.code, joined.token),
    });
  }
  const req = (command: Command, round = start ? 1 : 0): CommandRequest => ({
    requestId: randomUUID(),
    expectedRound: round,
    command,
  });
  if (start)
    await service.command(
      teacher.code,
      teacher.token,
      req({ type: "start" }, 0),
    );
  const buyers = students
    .filter((p) => p.view.me.role === "buyer")
    .sort((a, b) => b.view.me.limits!.apple - a.view.me.limits!.apple);
  const sellers = students
    .filter((p) => p.view.me.role === "seller")
    .sort((a, b) => a.view.me.limits!.apple - b.view.me.limits!.apple);
  const send = (token: string, command: Command, round = 1) =>
    service.command(teacher.code, token, req(command, round));
  return { teacher, students, buyers, sellers, send, req };
}

test("three independent markets have correct equilibrium intervals, quantities and scaling", () => {
  const base = schedules(12);
  assert.deepEqual(equilibrium(base.apple.values, base.apple.costs), {
    low: 29,
    high: 31,
    quantity: 4,
    surplus: 91,
  });
  assert.deepEqual(equilibrium(base.banana.values, base.banana.costs), {
    low: 49,
    high: 51,
    quantity: 5,
    surplus: 152,
  });
  assert.deepEqual(equilibrium(base.orange.values, base.orange.costs), {
    low: 69,
    high: 71,
    quantity: 3,
    surplus: 125,
  });
  const larger = schedules(24);
  const eq = equilibrium(larger.apple.values, larger.apple.costs);
  assert.equal(eq.quantity, 8);
  assert.equal(eq.surplus, 182);
  assert.equal(eq.low, 29);
  assert.equal(eq.high, 31);
});

test("seats are balanced and contain the complete predetermined schedules", async () => {
  const { teacher, students } = await classroom(false, 24);
  assert.equal(new Set(students.map((s) => s.view.me.alias)).size, 24);
  for (const good of GOODS) {
    const values = students
      .filter((s) => s.view.me.role === "buyer")
      .map((s) => s.view.me.limits![good.id])
      .sort((a, b) => b - a);
    assert.deepEqual(values, schedules(24)[good.id].values);
  }
  await assert.rejects(service.join(teacher.code, "追加", "111111"), /満員/);
});

test("cannot start without all seats; students cannot control the experiment or export data", async () => {
  const teacher = await service.create(
    { title: "未完の実験", capacity: 12, rounds: 2, duration: 60 },
    "test-teacher-password",
    "",
  );
  const student = await service.join(teacher.code, "学生", "123456");
  const req: CommandRequest = {
    requestId: randomUUID(),
    expectedRound: 0,
    command: { type: "start" },
  };
  await assert.rejects(
    service.command(teacher.code, teacher.token, req),
    /そろう/,
  );
  await assert.rejects(
    service.command(teacher.code, student.token, req),
    /教員のみ/,
  );
  await assert.rejects(service.export(teacher.code, student.token), /教員のみ/);
  await assert.rejects(service.view(teacher.code), /入室が必要/);
});

test("student snapshots expose only their own private information, never credentials or schedules", async () => {
  const { teacher, buyers } = await classroom();
  const view = await service.view(teacher.code, buyers[0].token);
  assert.equal(view.teacher, undefined);
  const serialized = JSON.stringify(view);
  for (const secret of [
    "tokenHash",
    "pinHash",
    "PasswordHash",
    "equilibria",
    "schedules",
    "participants",
    "receipts",
    "seats",
  ])
    assert.ok(!serialized.includes(`\"${secret}\"`), secret);
  assert.deepEqual(view.me.limits, buyers[0].view.me.limits);
  const exported = await service.export(teacher.code, teacher.token);
  const settings = exportData(
    exported.room,
    exported.events,
    exported.now,
    "settings",
  ).content;
  assert.ok(!settings.includes(exported.room.teacherTokenHash));
  assert.ok(!settings.includes(exported.room.participants[0].pinHash));
});

test("crossing buy order executes at resting ask price and calculates both profits", async () => {
  const { teacher, buyers, sellers, send } = await classroom();
  await send(sellers[0].token, { type: "quote", good: "apple", price: 30 });
  const view = await send(buyers[0].token, {
    type: "quote",
    good: "apple",
    price: 40,
  });
  assert.equal(view.trades.length, 1);
  assert.equal(view.trades[0].price, 30);
  assert.equal(view.me.profit, 24);
  assert.deepEqual(view.me.used, ["apple"]);
  assert.equal(
    (await service.view(teacher.code, sellers[0].token)).me.profit,
    21,
  );
  assert.equal(view.quotes.length, 0);
  await assert.rejects(
    send(buyers[0].token, { type: "quote", good: "apple", price: 30 }),
    /完了/,
  );
  await send(buyers[0].token, { type: "quote", good: "banana", price: 40 });
});

test("crossing sell order executes at resting bid price", async () => {
  const { buyers, sellers, send } = await classroom();
  await send(buyers[0].token, { type: "quote", good: "apple", price: 40 });
  const view = await send(sellers[0].token, {
    type: "quote",
    good: "apple",
    price: 20,
  });
  assert.equal(view.trades[0].price, 40);
  assert.equal(view.me.profit, 31);
});

test("price priority beats arrival time; equal prices follow time priority", async () => {
  const { buyers, sellers, send } = await classroom();
  await send(sellers[0].token, { type: "quote", good: "apple", price: 32 });
  await send(sellers[1].token, { type: "quote", good: "apple", price: 30 });
  await send(sellers[2].token, { type: "quote", good: "apple", price: 30 });
  const first = await send(buyers[0].token, {
    type: "quote",
    good: "apple",
    price: 40,
  });
  assert.equal(first.trades[0].sellerId, sellers[1].view.me.id);
  const second = await send(buyers[1].token, {
    type: "quote",
    good: "apple",
    price: 40,
  });
  assert.equal(second.trades[1].sellerId, sellers[2].view.me.id);
});

test("replacing a quote loses time priority and records its cancellation", async () => {
  const { teacher, buyers, sellers, send } = await classroom();
  await send(sellers[0].token, { type: "quote", good: "apple", price: 30 });
  await send(sellers[1].token, { type: "quote", good: "apple", price: 30 });
  await send(sellers[0].token, { type: "quote", good: "apple", price: 30 });
  const view = await send(buyers[0].token, {
    type: "quote",
    good: "apple",
    price: 30,
  });
  assert.equal(view.trades[0].sellerId, sellers[1].view.me.id);
  const { events } = await service.export(teacher.code, teacher.token);
  assert.ok(
    events.some((e) => e.type === "cancel" && e.detail.reason === "replace"),
  );
});

test("invalid replacements do not destroy an existing order or partially write audit records", async () => {
  const { teacher, buyers, send } = await classroom();
  const before = await send(buyers[0].token, {
    type: "quote",
    good: "apple",
    price: 20,
  });
  await assert.rejects(
    send(buyers[0].token, { type: "quote", good: "apple", price: 100 }),
    /価値/,
  );
  const after = await service.view(teacher.code, buyers[0].token);
  assert.deepEqual(after.quotes, before.quotes);
  assert.equal(after.version, before.version);
  await assert.rejects(
    send(buyers[0].token, { type: "quote", good: "apple", price: 20.5 }),
    /整数/,
  );
});

test("simultaneous accepts can fill a standing order exactly once", async () => {
  const { teacher, buyers, sellers, send } = await classroom();
  const quoted = await send(sellers[0].token, {
    type: "quote",
    good: "apple",
    price: 30,
  });
  const attempts = await Promise.allSettled(
    buyers
      .slice(0, 4)
      .map((b) =>
        send(b.token, { type: "accept", quoteId: quoted.quotes[0].id }),
      ),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  const { room, events } = await service.export(teacher.code, teacher.token);
  assert.equal(room.trades.length, 1);
  assert.equal(events.filter((e) => e.type === "trade").length, 1);
  assert.equal(new Set(events.map((e) => e.sequence)).size, events.length);
});

test("concurrent retries are idempotent, including retries after round changes", async () => {
  const { teacher, buyers, sellers, send, req } = await classroom();
  await send(sellers[0].token, { type: "quote", good: "apple", price: 30 });
  const request = req({ type: "quote", good: "apple", price: 40 });
  await Promise.all([
    service.command(teacher.code, buyers[0].token, request),
    service.command(teacher.code, buyers[0].token, request),
  ]);
  await send(teacher.token, { type: "end-round" });
  await send(teacher.token, { type: "start" });
  const retried = await service.command(teacher.code, buyers[0].token, request);
  assert.equal(retried.trades.length, 1);
  assert.equal(retried.round, 2);
  assert.deepEqual(retried.me.used, []);
});

test("stale accept never becomes a new order and cannot skip the best price", async () => {
  const { teacher, buyers, sellers, send } = await classroom();
  const first = await send(sellers[0].token, {
    type: "quote",
    good: "apple",
    price: 35,
  });
  const id = first.quotes[0].id;
  await send(sellers[1].token, { type: "quote", good: "apple", price: 30 });
  await assert.rejects(
    send(buyers[0].token, { type: "accept", quoteId: id }),
    /最良気配/,
  );
  await send(sellers[0].token, { type: "cancel", good: "apple" });
  await assert.rejects(
    send(buyers[0].token, { type: "accept", quoteId: id }),
    /約定済み/,
  );
  const view = await service.view(teacher.code, buyers[0].token);
  assert.equal(view.trades.length, 0);
  assert.equal(view.quotes.length, 1);
});

test("server deadline rejects late transactions and clears orders at the recorded deadline", async () => {
  const { teacher, buyers, sellers, send } = await classroom();
  await send(sellers[0].token, { type: "quote", good: "apple", price: 30 });
  const { room } = await service.export(teacher.code, teacher.token);
  room.deadline = Date.now() - 1;
  await db.query("UPDATE auction_rooms SET state=$2::jsonb WHERE code=$1", [
    teacher.code,
    JSON.stringify(room),
  ]);
  await assert.rejects(
    send(buyers[0].token, { type: "quote", good: "apple", price: 40 }),
    /取引時間外/,
  );
  const ended = await service.view(teacher.code, teacher.token);
  assert.equal(ended.phase, "review");
  assert.equal(ended.trades.length, 0);
  assert.equal(ended.quotes.length, 0);
  const { events } = await service.export(teacher.code, teacher.token);
  assert.equal(events.at(-1)!.at, room.deadline);
});

test("pause preserves orders, resume resets deadline, and new rounds reset units but keep roles and profits", async () => {
  const { teacher, buyers, sellers, send } = await classroom();
  await send(sellers[0].token, { type: "quote", good: "apple", price: 30 });
  const paused = await send(teacher.token, { type: "pause" });
  assert.equal(paused.deadline, null);
  assert.equal(paused.quotes.length, 1);
  await assert.rejects(
    send(buyers[0].token, { type: "quote", good: "apple", price: 40 }),
    /取引時間外/,
  );
  const resumed = await send(teacher.token, { type: "resume" });
  assert.ok(resumed.deadline! > resumed.serverTime);
  await send(buyers[0].token, { type: "quote", good: "apple", price: 40 });
  await send(teacher.token, { type: "end-round" });
  await send(teacher.token, { type: "start" });
  const next = await service.view(teacher.code, buyers[0].token);
  assert.equal(next.round, 2);
  assert.equal(next.me.profit, 24);
  assert.equal(next.me.roundProfit, 0);
  assert.deepEqual(next.me.used, []);
  assert.deepEqual(next.me.limits, buyers[0].view.me.limits);
  assert.equal(next.me.role, "buyer");
  await assert.rejects(
    send(buyers[0].token, { type: "quote", good: "apple", price: 40 }, 1),
    /切り替わりました/,
  );
  await send(buyers[0].token, { type: "quote", good: "apple", price: 40 }, 2);
});

test("PIN recovery preserves identity and invalidates old cookies; login attempts are bounded", async () => {
  const { teacher, buyers } = await classroom();
  const old = buyers[0];
  const recovered = await service.join(
    teacher.code,
    old.view.me.nickname,
    "123456",
  );
  const view = await service.view(teacher.code, recovered.token);
  assert.equal(view.me.id, old.view.me.id);
  await assert.rejects(service.view(teacher.code, old.token), /有効期限/);
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      service.join(teacher.code, old.view.me.nickname, "999999"),
      /正しい暗証番号/,
    );
  await assert.rejects(
    service.join(teacher.code, old.view.me.nickname, "123456"),
    /試行回数/,
  );
  const recoveredTeacher = await service.recoverTeacher(
    teacher.code,
    "test-teacher-password",
  );
  assert.equal(
    (await service.view(teacher.code, recoveredTeacher.token)).me.role,
    "teacher",
  );
  await assert.rejects(service.view(teacher.code, teacher.token), /有効期限/);
});

test("metrics use distance to the interval, not cancellation of signed price errors", async () => {
  const { teacher, buyers, sellers, send } = await classroom();
  await send(sellers[0].token, { type: "quote", good: "apple", price: 20 });
  await send(buyers[0].token, { type: "quote", good: "apple", price: 20 });
  await send(sellers[1].token, { type: "quote", good: "apple", price: 40 });
  const view = await send(buyers[1].token, {
    type: "quote",
    good: "apple",
    price: 40,
  });
  assert.equal(view.trades.length, 2);
  const teacherView = await service.view(teacher.code, teacher.token);
  const metric = teacherView.teacher!.metrics.apple[0];
  assert.equal(metric.mean, 30);
  assert.equal(metric.deviation, 9);
  assert.equal(metric.quantity, 2);
  assert.equal(metric.efficiency, ((54 - 9 + 46 - 18) / 91) * 100);
  assert.equal(teacherView.teacher!.metrics.banana[0].mean, null);
});

test("CSV is Excel-compatible, escaped and formula-safe", () => {
  const out = csv([
    ["名前", "値"],
    ["=SUM(1,2)", 'a"b'],
    ["普通の名前", 5],
  ]);
  assert.ok(out.startsWith("\uFEFF"));
  assert.ok(out.includes('"\'=SUM(1,2)"'));
  assert.ok(out.includes('"a""b"'));
  assert.ok(out.includes("\r\n"));
});
