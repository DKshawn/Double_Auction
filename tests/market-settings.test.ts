import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { GOODS } from "../src/lib/catalog";
import type { Command, MarketSettings } from "../src/lib/types";
import { equilibrium } from "../src/lib/equilibrium";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import {
  defaultMarketSettings,
  limitsForSeat,
} from "../src/lib/server/experiment";
import { AuctionService } from "../src/lib/server/service";
import { exportData } from "../src/lib/server/export";
import { AuctionError } from "../src/lib/server/model";

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

async function classroom(capacity = 12, joinCount = capacity) {
  const teacher = await service.create(
    { title: "条件設定のテスト", capacity, rounds: 3, duration: 180 },
    "teacher-test-password",
    "",
  );
  const students = [];
  for (let i = 0; i < joinCount; i++)
    students.push(await service.join(teacher.code, `学生${i + 1}`, "123456"));
  const send = (token: string, command: Command, expectedRound = 0) =>
    service.command(teacher.code, token, {
      requestId: randomUUID(),
      expectedRound,
      command,
    });
  return { teacher, students, send };
}

function customSettings() {
  const settings = defaultMarketSettings();
  // Intentionally unsorted: seat assignments must preserve condition rows.
  settings.apple = {
    values: [70, 120, 80, 110, 100, 90],
    costs: [120, 70, 110, 80, 90, 100],
  };
  settings.banana.values[0] = 88;
  settings.orange.costs[0] = 33;
  return settings;
}

test("custom conditions persist, update existing and later students, drive trades and remain private", async () => {
  const { teacher, students, send } = await classroom(12, 1);
  const settings = customSettings();
  const saved = await send(teacher.token, {
    type: "update-markets",
    settings,
    expectedRevision: 0,
  });
  assert.deepEqual(saved.teacher!.marketSettings, settings);
  assert.deepEqual(saved.teacher!.equilibria.apple, {
    low: 90,
    high: 100,
    quantity: 3,
    quantityMax: 3,
    surplus: 90,
  });
  for (let i = 1; i < 12; i++)
    students.push(await service.join(teacher.code, `学生${i + 1}`, "123456"));
  const { room, events } = await service.export(teacher.code, teacher.token);
  for (const participant of room.participants)
    assert.deepEqual(
      participant.limits,
      limitsForSeat(participant.seat, 12, settings),
    );
  assert.deepEqual(
    events.find((event) => event.type === "market-settings-updated")!.detail
      .marketSettings,
    settings,
  );
  const exported = JSON.parse(
    exportData(room, events, Date.now(), "settings").content,
  );
  assert.deepEqual(exported.marketSettings, settings);
  assert.deepEqual(exported.equilibria.apple, saved.teacher!.equilibria.apple);

  const views = await Promise.all(
    students.map(async (student) => ({
      ...student,
      view: await service.view(teacher.code, student.token),
    })),
  );
  for (const { view } of views) {
    assert.equal(view.teacher, undefined);
    assert.doesNotMatch(
      JSON.stringify(view),
      /marketSettings|settingsRevision|schedules|equilibria/,
    );
  }
  const buyer = views.find(
    ({ view }) => view.me.role === "buyer" && view.me.limits!.apple === 120,
  )!;
  const seller = views.find(
    ({ view }) => view.me.role === "seller" && view.me.limits!.apple === 70,
  )!;
  await send(teacher.token, { type: "start" });
  await send(seller.token, { type: "quote", good: "apple", price: 85 }, 1);
  const bought = await send(
    buyer.token,
    { type: "quote", good: "apple", price: 85 },
    1,
  );
  assert.equal(bought.me.profit, 35);
  assert.equal((await service.view(teacher.code, seller.token)).me.profit, 15);
  const metrics = (await service.view(teacher.code, teacher.token)).teacher!
    .metrics.apple[0];
  assert.equal(metrics.deviation, 5);
  assert.equal(metrics.efficiency, (50 / 90) * 100);
  await send(teacher.token, { type: "end-round" }, 1);
  await send(teacher.token, { type: "start" }, 1);
  assert.deepEqual(
    (await service.view(teacher.code, buyer.token)).me.limits,
    buyer.view.me.limits,
  );
});

test("custom conditions repeat for 24 and 36 participants with matching equilibrium quantities", async () => {
  for (const capacity of [24, 36]) {
    const { teacher, send } = await classroom(capacity);
    const settings = customSettings();
    const view = await send(teacher.token, {
      type: "update-markets",
      settings,
      expectedRevision: 0,
    });
    for (const good of GOODS) {
      const values = view
        .teacher!.participants.filter((p) => p.role === "buyer")
        .map((p) => p.limits[good.id])
        .sort((a, b) => b - a);
      const costs = view
        .teacher!.participants.filter((p) => p.role === "seller")
        .map((p) => p.limits[good.id])
        .sort((a, b) => a - b);
      assert.deepEqual(values, view.teacher!.schedules[good.id].values);
      assert.deepEqual(costs, view.teacher!.schedules[good.id].costs);
    }
    assert.equal(view.teacher!.equilibria.apple.quantity, (3 * capacity) / 12);
    assert.equal(view.teacher!.equilibria.apple.surplus, (90 * capacity) / 12);
  }
});

test("settings require a teacher, reject invalid values and stale edits, and lock in every phase after start", async () => {
  const { teacher, students, send } = await classroom();
  const settings = customSettings();
  const update = {
    type: "update-markets",
    settings,
    expectedRevision: 0,
  } as const;
  await assert.rejects(
    send(students[0].token, update),
    (error: unknown) => error instanceof AuctionError && error.status === 403,
  );
  for (const values of [
    [1, 2],
    [0, 2, 3, 4, 5, 6],
    [1000, 2, 3, 4, 5, 6],
    [1.5, 2, 3, 4, 5, 6],
  ]) {
    const invalid: MarketSettings = {
      ...settings,
      apple: { ...settings.apple, values },
    };
    await assert.rejects(
      send(teacher.token, { ...update, settings: invalid }),
      /1〜999/,
    );
  }
  assert.equal(
    (await service.view(teacher.code, teacher.token)).teacher!.settingsRevision,
    0,
  );
  // Competing saves use one atomic revision check, so only one can succeed.
  const outcomes = await Promise.allSettled([
    send(teacher.token, update),
    send(teacher.token, update),
  ]);
  assert.equal(
    outcomes.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    (await service.view(teacher.code, teacher.token)).teacher!.settingsRevision,
    1,
  );
  await assert.rejects(send(teacher.token, update), /別の画面/);
  await send(teacher.token, { type: "start" });
  const locked = { ...update, expectedRevision: 1 };
  await assert.rejects(send(teacher.token, locked, 1), /実験開始前/);
  await send(teacher.token, { type: "pause" }, 1);
  await assert.rejects(send(teacher.token, locked, 1), /実験開始前/);
  await send(teacher.token, { type: "end-round" }, 1);
  await assert.rejects(send(teacher.token, locked, 1), /実験開始前/);
  await send(teacher.token, { type: "finish" }, 1);
  await assert.rejects(send(teacher.token, locked, 1), /実験開始前/);
  assert.deepEqual(
    (await service.view(teacher.code, teacher.token)).teacher!.marketSettings,
    settings,
  );
  const { events } = await service.export(teacher.code, teacher.token);
  assert.equal(
    events.filter((event) => event.type === "market-settings-updated").length,
    1,
  );
});

test("legacy rooms retain their original conditions and settings retries are idempotent", async () => {
  const { teacher } = await classroom();
  const { room } = await service.export(teacher.code, teacher.token);
  delete room.marketSettings;
  delete room.settingsRevision;
  await db.query("UPDATE auction_rooms SET state=$2::jsonb WHERE code=$1", [
    teacher.code,
    JSON.stringify(room),
  ]);
  const legacy = await service.view(teacher.code, teacher.token);
  assert.deepEqual(legacy.teacher!.marketSettings, defaultMarketSettings());
  const request = {
    requestId: randomUUID(),
    expectedRound: 0,
    command: {
      type: "update-markets",
      settings: customSettings(),
      expectedRevision: 0,
    } as const,
  };
  await service.command(teacher.code, teacher.token, request);
  const retry = await service.command(teacher.code, teacher.token, request);
  assert.equal(retry.teacher!.settingsRevision, 1);
});

test("zero-surplus marginal trades have a quantity range and zero maximum surplus has no efficiency ratio", async () => {
  assert.deepEqual(equilibrium([90, 50, 50], [10, 50, 50]), {
    low: 50,
    high: 50,
    quantity: 1,
    quantityMax: 3,
    surplus: 80,
  });
  assert.deepEqual(equilibrium([10, 10], [20, 20]), {
    low: 10,
    high: 20,
    quantity: 0,
    quantityMax: 0,
    surplus: 0,
  });
  assert.deepEqual(equilibrium([90, 80], [10, 20]), {
    low: 20,
    high: 80,
    quantity: 2,
    quantityMax: 2,
    surplus: 140,
  });
  const { teacher, send } = await classroom();
  const settings = defaultMarketSettings();
  settings.apple = { values: Array(6).fill(50), costs: Array(6).fill(50) };
  await send(teacher.token, {
    type: "update-markets",
    settings,
    expectedRevision: 0,
  });
  const running = await send(teacher.token, { type: "start" });
  assert.equal(running.teacher!.equilibria.apple.quantityMax, 6);
  assert.equal(running.teacher!.metrics.apple[0].efficiency, null);
});
