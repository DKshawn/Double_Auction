import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import { AuctionService } from "../src/experiments/double-auction/server/service";
import { EmhService } from "../src/experiments/emh/server/service";
import { allocationPlan } from "../src/experiments/emh/allocation";
import { experimentFor } from "../src/lib/server/experiment-registry";
import type { Action, Room } from "../src/experiments/emh/types";
import type {
  SessionCommand,
  RequestCommand,
} from "../src/experiments/emh/session-types";
import { DEFAULT_CONFIG } from "../src/experiments/emh/server/default-config";
import {
  createSchema,
  commandSchema,
} from "../src/experiments/emh/server/validation";

let pg: PGlite, db: Database, emh: EmhService, da: AuctionService;
before(async () => {
  pg = new PGlite();
  db = localDatabase(pg);
  await migrate(db);
  emh = new EmhService(db);
  da = new AuctionService(db);
});
after(async () => {
  await pg.close();
});
const password = "Integration-Teacher-2026";
async function classroom(n: number) {
  const teacher = await emh.create("EMH classroom", password, "");
  const students = [];
  for (let i = 0; i < n; i++)
    students.push({
      ...(await emh.login(teacher.code, {
        role: "student",
        nickname: `s${i}`,
        pin: "1234",
      })),
      name: `s${i}`,
    });
  const get = (
    token = teacher.token,
    role: "teacher" | "student" = "teacher",
    market?: number,
  ) => emh.request(teacher.code, token, role, market);
  async function command(kind: SessionCommand["kind"]) {
    const current = await get();
    const input: RequestCommand = {
      scope: "session",
      requestId: randomUUID(),
      command: { kind, expectedRevision: current.state.revision },
    };
    const result = await emh.request(
      teacher.code,
      teacher.token,
      "teacher",
      undefined,
      input,
    );
    assert.equal(
      result.error,
      undefined,
      result.error?.message ?? "command failed",
    );
    return result;
  }
  async function act(
    token: string,
    marketId: number,
    action: Action,
    role: "teacher" | "student" = "student",
  ) {
    return emh.request(teacher.code, token, role, marketId, {
      scope: "market",
      requestId: randomUUID(),
      marketId,
      action,
    });
  }
  return { teacher, students, get, command, act };
}

test("every attendance 3–999 includes everyone, balances groups and types locally and across the class", () => {
  assert.deepEqual(allocationPlan(0), []);
  for (let n = 3; n <= 999; n++) {
    const groups = allocationPlan(n);
    const sizes = groups.map((g) => g.size);
    assert.equal(
      sizes.reduce((a, b) => a + b, 0),
      n,
    );
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    assert.ok(sizes.every((size) => size >= 3 && size <= 12));
    const totals = [0, 0, 0];
    for (const group of groups) {
      assert.equal(
        group.typeCounts.reduce((a, b) => a + b, 0),
        group.size,
      );
      assert.ok(
        Math.max(...group.typeCounts) - Math.min(...group.typeCounts) <= 1,
      );
      group.typeCounts.forEach((v, i) => (totals[i] += v));
    }
    assert.ok(Math.max(...totals) - Math.min(...totals) <= 1);
  }
  assert.deepEqual(
    allocationPlan(30).map((g) => g.size),
    [10, 10, 10],
  );
  assert.deepEqual(
    allocationPlan(100).map((g) => g.size),
    [10, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
  );
  for (const bad of [-1, 3.5, 1000]) assert.throws(() => allocationPlan(bad));
});

test("shared registry preserves both experiments and safely backfills existing room codes", async () => {
  const first = await emh.create("EMH", password, "");
  const second = await da.create(
    { title: "DA", capacity: 12, rounds: 1, duration: 60 },
    password,
    "",
  );
  assert.equal(await experimentFor(first.code, db), "emh");
  assert.equal(await experimentFor(second.code, db), "institutions");
  assert.notEqual(first.code, second.code);
  assert.equal(
    (await emh.listRooms("")).find((r) => r.code === first.code)?.experiment,
    "emh",
  );
  assert.ok((await da.listRooms("")).some((r) => r.code === second.code));
  await db.query("DELETE FROM lab_room_registry WHERE code=$1", [second.code]);
  await migrate(db);
  assert.equal(await experimentFor(second.code, db), "institutions");
  await da.deleteRoom(second.code, "");
  assert.equal(await experimentFor(second.code, db), null);
  await emh.deleteRoom(first.code, "");
  assert.equal(await experimentFor(first.code, db), null);
});

test("30 students become three private markets; all six-round default conditions remain unchanged", async () => {
  const c = await classroom(30);
  const open = await c.get();
  await c.command("assign");
  const stale = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      scope: "session",
      requestId: randomUUID(),
      command: { kind: "start", expectedRevision: open.state.revision },
    },
  );
  assert.ok(stale.error);
  const assigned = await c.get();
  assert.equal(assigned.state.market, null);
  assert.deepEqual(
    assigned.state.allocation.map((m) => m.size),
    [10, 10, 10],
  );
  assert.equal(new Set(assigned.state.participants.map((p) => p.id)).size, 30);
  await assert.rejects(
    emh.login(c.teacher.code, {
      role: "student",
      nickname: "late",
      pin: "1234",
    }),
  );
  await c.command("start");
  const stored = await db.query<{ state: Room }>(
    "SELECT state FROM emh_markets WHERE room_code=$1 ORDER BY market_id",
    [c.teacher.code],
  );
  assert.equal(stored.rows.length, 3);
  for (const { state } of stored.rows) {
    assert.deepEqual(state.config, {
      ...DEFAULT_CONFIG,
      title: "EMH classroom",
    });
    assert.equal(
      state.participants.reduce((s, p) => s + p.holdings, 0),
      20,
    );
    assert.equal(state.participants.length, 10);
    assert.deepEqual(
      [1, 2, 3].map(
        (type) => state.participants.filter((p) => p.type === type).length,
      ),
      state.typeCounts,
    );
  }
  const student = (await c.get(c.students[0].token, "student")).state;
  assert.equal(student.allocation.length, 0);
  assert.equal(student.markets.length, 0);
  assert.equal(student.participants.length, 0);
  assert.equal(student.market?.participants.length, 0);
  assert.equal(student.market?.conditions, null);
  assert.equal(student.market?.me?.holdings, 2);
  const serialized = JSON.stringify(student);
  for (const secret of [
    "pinHash",
    "tokenHash",
    "teacherPasswordHash",
    '"nickname"',
  ])
    assert.ok(!serialized.includes(secret));
  await assert.rejects(
    c.get(c.students[0].token, "student", student.marketId === 1 ? 2 : 1),
  );
  await assert.rejects(c.get(c.students[0].token, "teacher"));
  await assert.rejects(c.get(c.teacher.token, "student"));
  const denied = await c.act(c.students[0].token, student.marketId!, {
    kind: "end-period",
    expectedPhase: student.market!.phaseKey,
  });
  assert.ok(denied.error);
  const conditions = JSON.parse(
    (await emh.export(c.teacher.code, c.teacher.token, "teacher", "conditions"))
      .body,
  );
  assert.equal(conditions.markets.length, 3);
  for (const secret of ["pinHash", "tokenHash", "teacherPasswordHash"])
    assert.ok(!JSON.stringify(conditions).includes(secret));
  await assert.rejects(
    emh.export(c.teacher.code, c.students[0].token, "student", "conditions"),
  );
  const personal = (
    await emh.export(c.teacher.code, c.students[0].token, "student", "personal")
  ).body;
  assert.ok(!personal.includes('"dividends"'));
  await assert.rejects(
    emh.export(
      c.teacher.code,
      c.students[0].token,
      "student",
      "trades",
      student.marketId === 1 ? 2 : 1,
    ),
  );
  await c.command("pause-all");
  assert.ok((await c.get()).state.markets.every((m) => m.paused));
  await c.command("resume-all");
  assert.ok((await c.get()).state.markets.every((m) => !m.paused));
  const premature = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      scope: "session",
      requestId: randomUUID(),
      command: {
        kind: "reveal-all",
        expectedRevision: (await c.get()).state.revision,
      },
    },
  );
  assert.ok(premature.error);
});

test("market trades, payouts and retries stay isolated; concurrent accept settles once", async () => {
  const c = await classroom(14);
  await c.command("assign");
  await c.command("start");
  const views = await Promise.all(
    c.students.map(async (s) => ({
      s,
      v: (await c.get(s.token, "student")).state,
    })),
  );
  const group = views.filter((p) => p.v.marketId === 1);
  const untouched = (await c.get(c.teacher.token, "teacher", 2)).state.market!;
  const seller = group[0],
    buyer = group[1];
  const quoted = await c.act(seller.s.token, 1, {
    kind: "quote",
    side: "ask",
    price: 300,
    unitKey: seller.v.market!.unitKey,
  });
  assert.equal(quoted.error, undefined);
  const offer = quoted.state.market!.ask!;
  const input: RequestCommand = {
    requestId: randomUUID(),
    scope: "market",
    marketId: 1,
    action: {
      kind: "accept",
      side: "ask",
      quoteId: offer.id,
      unitKey: quoted.state.market!.unitKey,
    },
  };
  const results = await Promise.all(
    [1, 2].map(() =>
      emh.request(c.teacher.code, buyer.s.token, "student", 1, input),
    ),
  );
  assert.ok(results.every((r) => !r.error));
  const traded = (await c.get(c.teacher.token, "teacher", 1)).state.market!;
  assert.equal(traded.trades.length, 1);
  assert.equal(
    (await c.get(c.teacher.token, "teacher", 2)).state.market!.revision,
    untouched.revision,
  );
  const changed = await emh.request(
    c.teacher.code,
    buyer.s.token,
    "student",
    1,
    {
      ...input,
      action: { kind: "quote", side: "bid", price: 1, unitKey: traded.unitKey },
    },
  );
  assert.ok(changed.error);
  const nextQuote = await c.act(seller.s.token, 1, {
    kind: "quote",
    side: "ask",
    price: 301,
    unitKey: traded.unitKey,
  });
  const nextOffer = nextQuote.state.market!.ask!;
  const attempts = await Promise.all(
    group.slice(1, 3).map((p) =>
      c.act(p.s.token, 1, {
        kind: "accept",
        side: "ask",
        quoteId: nextOffer.id,
        unitKey: nextQuote.state.market!.unitKey,
      }),
    ),
  );
  assert.equal(attempts.filter((r) => !r.error).length, 1);
  let current = (await c.get(c.teacher.token, "teacher", 1)).state.market!;
  await c.act(
    c.teacher.token,
    1,
    { kind: "end-period", expectedPhase: current.phaseKey },
    "teacher",
  );
  current = (await c.get(c.teacher.token, "teacher", 1)).state.market!;
  assert.equal(current.period, "B");
  assert.equal(current.results[0].maxDividend, 14 * 257);
  assert.equal(
    (await c.get(c.teacher.token, "teacher", 2)).state.market!.period,
    "A",
  );
  const all = (
    await emh.export(c.teacher.code, c.teacher.token, "teacher", "trades")
  ).body;
  assert.equal(all.split('"market"').length, 2);
  assert.equal(all.split("\r\n").length, 3);
  assert.ok(all.startsWith('\uFEFF"market",'));
});

test("reopening keeps all participants, replaces unstarted allocations, and allows PIN re-entry", async () => {
  const c = await classroom(3);
  await c.command("assign");
  await c.command("reopen");
  await emh.login(c.teacher.code, {
    role: "student",
    nickname: "late",
    pin: "1234",
  });
  await c.command("assign");
  assert.equal((await c.get()).state.participantCount, 4);
  await assert.rejects(
    emh.login(c.teacher.code, { role: "student", nickname: "s0", pin: "9999" }),
  );
  const renewed = await emh.login(c.teacher.code, {
    role: "student",
    nickname: "s0",
    pin: "1234",
  });
  await assert.rejects(c.get(c.students[0].token, "student"));
  assert.equal(
    (await c.get(renewed.token, "student")).state.status,
    "assigned",
  );
  await c.command("start");
  const forbidden = await emh.request(
    c.teacher.code,
    c.teacher.token,
    "teacher",
    undefined,
    {
      scope: "session",
      requestId: randomUUID(),
      command: {
        kind: "reopen",
        expectedRevision: (await c.get()).state.revision,
      },
    },
  );
  assert.ok(forbidden.error);
  await emh.deleteRoom(c.teacher.code, "");
  assert.equal(
    (
      await db.query("SELECT * FROM emh_markets WHERE room_code=$1", [
        c.teacher.code,
      ])
    ).rows.length,
    0,
  );
});

test("clock changes survive a stale action and complete every default round before reveal", async () => {
  const c = await classroom(3);
  await c.command("assign");
  await c.command("start");
  const before = (await c.get(c.students[0].token, "student")).state;
  const record = await db.query<{ state: Room }>(
    "SELECT state FROM emh_markets WHERE room_code=$1",
    [c.teacher.code],
  );
  const room = record.rows[0].state;
  room.periodEndsAt = Date.now() - 1;
  room.unitEndsAt = room.periodEndsAt;
  await db.query("UPDATE emh_markets SET state=$2::jsonb WHERE room_code=$1", [
    c.teacher.code,
    JSON.stringify(room),
  ]);
  const stale = await c.act(c.students[0].token, 1, {
    kind: "quote",
    side: "bid",
    price: 1,
    unitKey: before.market!.unitKey,
  });
  assert.ok(stale.error);
  assert.equal(stale.state.market!.period, "B");
  for (let i = 0; i < 20; i++) {
    const market = (await c.get()).state.market!;
    if (market.status === "completed") break;
    const step = await c.act(
      c.teacher.token,
      1,
      {
        kind: market.status === "break" ? "next-year" : "end-period",
        expectedPhase: market.phaseKey,
      },
      "teacher",
    );
    assert.equal(step.error, undefined);
  }
  const finished = (await c.get()).state;
  assert.equal(finished.status, "completed");
  assert.equal(finished.market!.results.length, 12);
  const individualReveal = await c.act(
    c.teacher.token,
    1,
    { kind: "reveal", expectedPhase: finished.market!.phaseKey },
    "teacher",
  );
  assert.ok(individualReveal.error);
  const allRevealed = await c.command("reveal-all");
  assert.ok(allRevealed.state.markets.every((m) => m.revealed));
  const revealed = (await c.get(c.students[0].token, "student")).state.market!;
  assert.deepEqual(revealed.conditions, DEFAULT_CONFIG.dividends);
  assert.equal(revealed.me!.holdings, 0);
});

test("EMH API accepts only fixed defaults and validates command scope", () => {
  assert.ok(createSchema.safeParse({ title: "EMH", password }).success);
  assert.ok(
    !createSchema.safeParse({ title: "EMH", password, rounds: 1 }).success,
  );
  assert.ok(
    !commandSchema.safeParse({
      scope: "market",
      requestId: randomUUID(),
      marketId: 1,
      action: { kind: "start", expectedPhase: "x" },
    }).success,
  );
});
