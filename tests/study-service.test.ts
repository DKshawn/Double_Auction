import {
  lockBundle,
  saveBundle,
  readBundle,
} from "../src/lib/server/market-store";
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
import { commandSchema, configSchema } from "../src/lib/server/http";
import { exportData } from "../src/lib/server/export";
import { RealtimeBroker } from "../src/lib/server/realtime";
import { applyPatch, type RoomPatch } from "../src/lib/room-sync";
import type { Room } from "../src/lib/server/model";
import type { Command, RoomView } from "../src/lib/types";
import { DEFAULT_STUDY_TIMING } from "../src/lib/study-timing";

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

async function saveFixture(room: Room) {
  await db.transaction(async (tx) => {
    const before = await lockBundle(tx, room.code, undefined, true);
    await saveBundle(tx, before, room, []);
  });
}

async function classroom(markets = 1, marketSize = 16) {
  const teacher = await service.create(
    {
      title: "実験1テスト",
      protocol: "institutions-v1",
      markets,
      capacity: markets * marketSize,
      ...(marketSize === 16 ? {} : { marketSize }),
      rounds: 15,
      duration: 180,
    },
    "Test-Teacher-2026",
    "",
  );
  const students: { token: string; view: RoomView }[] = [];
  for (let i = 0; i < markets * marketSize; i++) {
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

test("timing validation rejects invalid creation and commands without changing saved settings", async () => {
  const config = {
    title: "時間設定テスト",
    protocol: "institutions-v1" as const,
    markets: 1,
    marketSize: 2,
    capacity: 2,
    rounds: 15,
    duration: 180,
    studyTiming: {
      cdaSeconds: 120,
      callSeconds: 20,
      offerSeconds: 45,
      buyerSeconds: 15,
    },
  };
  assert.equal(configSchema.safeParse(config).success, true);
  for (const key of Object.keys(
    DEFAULT_STUDY_TIMING,
  ) as (keyof typeof DEFAULT_STUDY_TIMING)[]) {
    for (const seconds of [0, -1, 1.5, 3601, NaN, Infinity]) {
      const timing = { ...DEFAULT_STUDY_TIMING, [key]: seconds };
      assert.equal(
        configSchema.safeParse({ ...config, studyTiming: timing }).success,
        false,
      );
      assert.equal(
        commandSchema.safeParse({
          requestId: randomUUID(),
          expectedRound: 0,
          command: { type: "study-timing", expectedRevision: 0, timing },
        }).success,
        false,
      );
      await assert.rejects(
        service.create(
          { ...config, studyTiming: timing },
          "Test-Teacher-2026",
          "",
        ),
        /時間/,
      );
    }
  }
  assert.equal(
    configSchema.safeParse({ ...config, studyTiming: { cdaSeconds: 120 } })
      .success,
    false,
  );
  const teacher = await service.create(config, "Test-Teacher-2026", "");
  const view = await service.view(teacher.code, teacher.token);
  assert.deepEqual(view.config.studyTiming, config.studyTiming);
  assert.equal(view.config.duration, 120);
  await assert.rejects(
    service.command(teacher.code, teacher.token, {
      requestId: randomUUID(),
      expectedRound: 0,
      command: {
        type: "study-timing",
        expectedRevision: 0,
        timing: { ...DEFAULT_STUDY_TIMING, callSeconds: 0 },
      },
    }),
    /時間/,
  );
  assert.deepEqual(
    (await service.view(teacher.code, teacher.token)).config,
    view.config,
  );
});

test("teacher timing is persisted, pushed to every market, audited and locked once the experiment opens", async () => {
  const { teacher, students, send } = await classroom(3, 2);
  const broker = new RealtimeBroker(db);
  const views = new Map<string, RoomView>();
  const stops: (() => void)[] = [];
  const timing = {
    cdaSeconds: 137,
    callSeconds: 47,
    offerSeconds: 71,
    buyerSeconds: 23,
  };
  try {
    for (const student of students)
      stops.push(
        await broker.subscribe(teacher.code, student.token, (event) => {
          if (event.type === "snapshot")
            views.set(student.token, event.data as RoomView);
          if (event.type === "patch")
            views.set(
              student.token,
              applyPatch(views.get(student.token)!, event.data as RoomPatch),
            );
        }),
      );
    await assert.rejects(
      send(students[0].token, {
        type: "study-timing",
        expectedRevision: 0,
        timing,
      }),
      /教員のみ/,
    );
    const updated = await send(teacher.token, {
      type: "study-timing",
      expectedRevision: 0,
      timing,
    });
    assert.equal(updated.study!.settingsRevision, 1);
    const until = Date.now() + 5000;
    while (
      students.some(
        (s) => views.get(s.token)?.config.studyTiming?.callSeconds !== 47,
      )
    ) {
      assert.ok(
        Date.now() < until,
        "timing update was not pushed to all markets",
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    for (const student of students)
      assert.deepEqual(views.get(student.token)!.config.studyTiming, timing);
    const reloaded = await new AuctionService(db).view(
      teacher.code,
      teacher.token,
    );
    assert.deepEqual(reloaded.config.studyTiming, timing);
    await assert.rejects(
      send(teacher.token, {
        type: "study-settings",
        expectedRevision: 0,
        settings: reloaded.study!.teacher!.settings,
      }),
      /更新/,
    );
    await assert.rejects(
      send(teacher.token, {
        type: "study-timing",
        expectedRevision: 0,
        timing: DEFAULT_STUDY_TIMING,
      }),
      /更新/,
    );
    const saved = await service.export(teacher.code, teacher.token);
    const json = JSON.parse(
      exportData(saved.room, saved.events, saved.now, "settings").content,
    );
    for (const key of Object.keys(timing) as (keyof typeof timing)[])
      assert.equal(json.rules[key], timing[key]);
    assert.deepEqual(
      saved.events.find((e) => e.type === "study-timing")!.detail.timing,
      timing,
    );
    await send(teacher.token, { type: "start" });
    await assert.rejects(
      send(teacher.token, {
        type: "study-timing",
        expectedRevision: 1,
        timing: DEFAULT_STUDY_TIMING,
      }),
      /開始前/,
    );
    await send(teacher.token, { type: "pause" });
    await assert.rejects(
      send(teacher.token, {
        type: "study-timing",
        expectedRevision: 1,
        timing: DEFAULT_STUDY_TIMING,
      }),
      /開始前/,
    );
    assert.deepEqual(
      (await service.view(teacher.code, teacher.token)).config.studyTiming,
      timing,
    );
  } finally {
    stops.forEach((stop) => stop());
    await broker.close();
  }
  // Even while an empty market is still waiting, opening the experiment locks timing.
  const waiting = await service.create(
    {
      title: "開始後の待機市場",
      protocol: "institutions-v1",
      markets: 1,
      marketSize: 2,
      capacity: 2,
      rounds: 15,
      duration: 180,
    },
    "Test-Teacher-2026",
    "",
  );
  await service.command(waiting.code, waiting.token, {
    requestId: randomUUID(),
    expectedRound: 0,
    command: { type: "start" },
  });
  await assert.rejects(
    service.command(waiting.code, waiting.token, {
      requestId: randomUUID(),
      expectedRound: 0,
      command: { type: "study-timing", expectedRevision: 0, timing },
    }),
    /開始前/,
  );
});

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

test("custom layout rejects odd groups, invalid market counts and totals above 192", async () => {
  const config = {
    title: "人数の検証",
    protocol: "institutions-v1" as const,
    markets: 3,
    marketSize: 6,
    capacity: 18,
    rounds: 15,
    duration: 180,
  };
  assert.equal(configSchema.safeParse(config).success, true);
  assert.equal(
    configSchema.safeParse({
      ...config,
      markets: 96,
      marketSize: 2,
      capacity: 192,
    }).success,
    true,
  );
  assert.equal(
    configSchema.safeParse({
      ...config,
      markets: 1,
      marketSize: 192,
      capacity: 192,
    }).success,
    true,
  );
  for (const change of [
    { marketSize: 5 },
    { marketSize: 0 },
    { marketSize: 6.5 },
    { markets: 0 },
    { markets: 2.5 },
    { markets: 33 },
  ]) {
    const invalid = { ...config, ...change };
    assert.equal(configSchema.safeParse(invalid).success, false);
    await assert.rejects(service.create(invalid, "Test-Teacher-2026", ""));
  }
  assert.equal(
    configSchema.safeParse({ ...config, capacity: 16 }).success,
    false,
  );
});

test("six-person groups preserve private conditions, market-scoped storage and live updates", async () => {
  const { teacher, students, send } = await classroom(3, 6);
  const saved = await service.export(teacher.code, teacher.token);
  saved.room.study!.markets.forEach((m) => {
    m.order = ["cda", "call", "posted"];
  });
  await saveFixture(saved.room);
  const initial = await service.view(teacher.code, teacher.token);
  assert.equal(initial.config.capacity, 18);
  const settings = initial.study!.teacher!.settings;
  assert.equal(settings.values.length, 3);
  for (let id = 1; id <= 3; id++) {
    const group = students.filter((s) => s.view.study!.market.id === id);
    assert.equal(group.length, 6);
    assert.equal(group.filter((s) => s.view.me.role === "buyer").length, 3);
    assert.equal(new Set(group.map((s) => s.view.me.alias)).size, 6);
    assert.equal(
      new Set(
        group
          .filter((s) => s.view.me.role === "buyer")
          .map((s) => s.view.study!.unitLimits!.join()),
      ).size,
      3,
    );
  }
  await assert.rejects(
    send(teacher.token, {
      type: "study-settings",
      settings: {
        values: settings.values.slice(1),
        costs: settings.costs.slice(1),
      },
      expectedRevision: 0,
    }),
    /3人×2単位/,
  );
  settings.values[0] = [121, 105];
  await send(teacher.token, {
    type: "study-settings",
    settings,
    expectedRevision: 0,
  });
  const group = students.filter((s) => s.view.study!.market.id === 3);
  const buyer = group.find((s) => s.view.me.role === "buyer")!;
  const seller = group.find((s) => s.view.me.role === "seller")!;
  const other = students.find((s) => s.view.study!.market.id === 2)!;
  await send(teacher.token, { type: "start" });
  const broker = new RealtimeBroker(db);
  const views = new Map<string, RoomView>();
  const stops: (() => void)[] = [];
  try {
    for (const s of [buyer, seller, other])
      stops.push(
        await broker.subscribe(teacher.code, s.token, (event) => {
          if (event.type === "snapshot")
            views.set(s.token, event.data as RoomView);
          if (event.type === "patch")
            views.set(
              s.token,
              applyPatch(views.get(s.token)!, event.data as RoomPatch),
            );
        }),
      );
    const otherVersion = views.get(other.token)!.version;
    await send(seller.token, { type: "study-quote", price: 80 });
    await send(buyer.token, { type: "study-quote", price: 80 });
    const end = Date.now() + 5000;
    while (
      views.get(buyer.token)!.study!.market.trades.length !== 1 ||
      views.get(seller.token)!.study!.market.trades.length !== 1
    ) {
      assert.ok(Date.now() < end, "custom market push timed out");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(views.get(other.token)!.version, otherVersion);
    assert.equal(views.get(other.token)!.study!.market.trades.length, 0);
    for (const s of [buyer, seller]) {
      const view = views.get(s.token)!;
      assert.equal(view.study!.market.id, 3);
      assert.equal(view.study!.teacher, undefined);
      assert.equal(view.study!.market.trades[0].market, 3);
      assert.equal(view.study!.market.trades[0].price, 80);
      const full = await service.view(teacher.code, s.token);
      const withoutClock = (v: RoomView) => ({
        ...v,
        serverTime: 0,
        remainingMs: 0,
        study: { ...v.study!, market: { ...v.study!.market, remainingMs: 0 } },
      });
      assert.deepEqual(withoutClock(view), withoutClock(full));
    }
    const final = await service.export(teacher.code, teacher.token);
    assert.equal(final.room.study!.markets[2].trades.length, 1);
    assert.equal(final.room.study!.markets[0].trades.length, 0);
    const data = JSON.parse(
      exportData(final.room, final.events, final.now, "settings").content,
    );
    assert.equal(data.rules.tradersPerMarket, 6);
    assert.equal(data.config.markets, 3);
  } finally {
    stops.forEach((stop) => stop());
    await broker.close();
  }
});

test("old single-row study rooms migrate without losing orders, audit events or retry receipts", async () => {
  const { teacher, students, send } = await classroom();
  await send(teacher.token, { type: "start" });
  const student = students[0],
    before = await service.view(teacher.code, student.token);
  const request = {
    requestId: randomUUID(),
    expectedRound: before.round,
    expectedStage: before.study!.market.stageKey,
    command: { type: "study-quote" as const, price: 75 },
  };
  const quoted = await service.command(teacher.code, student.token, request);
  const saved = await service.export(teacher.code, teacher.token);
  // Reconstruct the previous on-disk format in this test's isolated database.
  delete saved.room.storageVersion;
  delete saved.room.participantCount;
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO auction_events (room_code, sequence, event) SELECT room_code, sequence, jsonb_set(event, '{scope}', '0'::jsonb) FROM auction_market_events WHERE room_code = $1",
      [teacher.code],
    );
    await tx.query("DELETE FROM auction_market_events WHERE room_code = $1", [
      teacher.code,
    ]);
    await tx.query("DELETE FROM auction_order_history WHERE room_code = $1", [
      teacher.code,
    ]);
    await tx.query("DELETE FROM auction_markets WHERE room_code = $1", [
      teacher.code,
    ]);
    await tx.query(
      "UPDATE auction_rooms SET state = $2::jsonb WHERE code = $1",
      [teacher.code, JSON.stringify(saved.room)],
    );
  });
  const migrated = await service.view(teacher.code, student.token);
  assert.deepEqual(migrated.study!.market.orders, quoted.study!.market.orders);
  await service.command(teacher.code, student.token, request);
  const after = await service.export(teacher.code, teacher.token);
  assert.equal(after.events.length, saved.events.length);
  assert.deepEqual(after.room.receipts, saved.room.receipts);
  const stored = (
    await db.query<{ state: Room }>(
      "SELECT state FROM auction_rooms WHERE code = $1",
      [teacher.code],
    )
  ).rows[0].state;
  assert.equal(stored.storageVersion, 2);
  assert.equal(stored.study!.markets.length, 0);
  assert.equal(
    (
      await db.query(
        "SELECT market_id FROM auction_markets WHERE room_code = $1",
        [teacher.code],
      )
    ).rows.length,
    1,
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
  const history = (await service.view(teacher.code, buyers[0].token)).study!
    .market.orderHistory;
  assert.equal(history.length, 1);
  assert.equal(history[0].id, orderId);
  assert.equal(history[0].status, "filled");
  const saved = await service.export(teacher.code, teacher.token);
  assert.deepEqual(saved.room.study!.markets[0].orderHistory, history);
  assert.equal(saved.events.filter((e) => e.type === "order-closed").length, 1);
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
  await saveFixture(snapshot.room);
  await send(teacher.token, { type: "start" });
  for (const p of students)
    await send(p.token, {
      type: "call-submit",
      prices: p.view.study!.unitLimits!,
    });
  const room = (await service.export(teacher.code, teacher.token)).room;
  const deadline = Date.now() - 1;
  room.deadline = deadline;
  room.study!.markets[0].deadline = deadline;
  await saveFixture(room);
  const exported = await service.export(teacher.code, teacher.token);
  assert.equal(exported.room.study!.markets[0].trades.length, 11);
  assert.equal(exported.events.filter((e) => e.type === "trade").length, 11);
  assert.equal(exported.room.study!.markets[0].call, 2);
  const again = await service.export(teacher.code, teacher.token);
  assert.equal(again.events.length, exported.events.length);
});

test("Call rejects empty submissions without locking the participant and accepts one or two units", async () => {
  const { teacher, students, send } = await classroom();
  const snapshot = await service.export(teacher.code, teacher.token);
  snapshot.room.study!.markets[0].order = ["call", "cda", "posted"];
  await saveFixture(snapshot.room);
  await send(teacher.token, { type: "start" });
  const student = students.find((p) => p.view.me.role === "buyer")!;
  const view = await service.view(teacher.code, student.token);
  const emptyRequest = {
    requestId: randomUUID(),
    expectedRound: view.round,
    expectedStage: view.study!.market.stageKey,
    command: { type: "call-submit" as const, prices: [] },
  };
  assert.equal(commandSchema.safeParse(emptyRequest).success, false);
  await assert.rejects(
    service.command(teacher.code, student.token, emptyRequest),
    /残りの取引可能数/,
  );
  const afterEmpty = await new AuctionService(db).view(
    teacher.code,
    student.token,
  );
  assert.equal(afterEmpty.study!.market.submitted, false);
  assert.equal(afterEmpty.study!.unitsUsed, 0);
  assert.deepEqual(afterEmpty.study!.market.myOrders, []);
  for (const prices of [[100], [100, 80]])
    assert.equal(
      commandSchema.safeParse({
        ...emptyRequest,
        command: { type: "call-submit", prices },
      }).success,
      true,
    );
  const request = commandSchema.parse({
    ...emptyRequest,
    requestId: randomUUID(),
    command: { type: "call-submit", prices: [100, 80] },
  });
  await service.command(teacher.code, student.token, request);
  await service.command(teacher.code, student.token, request);
  const reloaded = await new AuctionService(db).view(
    teacher.code,
    student.token,
  );
  assert.equal(reloaded.study!.market.submitted, true);
  assert.deepEqual(
    reloaded.study!.market.myOrders.map((o) => o.price),
    [100, 80],
  );
  assert.equal(reloaded.study!.unitsUsed, 0);
  await assert.rejects(
    send(student.token, { type: "call-submit", prices: [80] }),
    /送信済み/,
  );
  const exported = await service.export(teacher.code, teacher.token);
  const passes = exported.events.filter((e) => e.type === "call-pass");
  assert.equal(passes.length, 0);
  assert.equal(
    exported.events.filter((e) => e.type === "call-order").length,
    2,
  );
  assert.equal(exported.room.study!.markets[0].orders.length, 2);
});

test("Posted Offer rejects zero quantity without locking the seller and persists one- and two-unit offers", async () => {
  const { teacher, students, send } = await classroom(1, 4);
  const snapshot = await service.export(teacher.code, teacher.token);
  snapshot.room.study!.markets[0].order = ["posted", "cda", "call"];
  await saveFixture(snapshot.room);
  await send(teacher.token, { type: "start" });
  const sellers = students.filter((p) => p.view.me.role === "seller");
  const view = await service.view(teacher.code, sellers[0].token);
  const zeroRequest = {
    requestId: randomUUID(),
    expectedRound: view.round,
    expectedStage: view.study!.market.stageKey,
    command: { type: "posted-offer" as const, price: 80, quantity: 0 },
  };
  assert.equal(commandSchema.safeParse(zeroRequest).success, false);
  await assert.rejects(
    service.command(teacher.code, sellers[0].token, zeroRequest),
    /1〜2単位/,
  );
  const afterZero = await new AuctionService(db).view(
    teacher.code,
    sellers[0].token,
  );
  assert.equal(afterZero.study!.market.submitted, false);
  assert.equal(afterZero.study!.market.myOffer, null);
  assert.equal(afterZero.study!.unitsUsed, 0);
  assert.equal(afterZero.me.profit, 0);
  for (const [i, quantity] of [1, 2].entries()) {
    const request = commandSchema.parse({
      ...zeroRequest,
      requestId: randomUUID(),
      command: { type: "posted-offer", price: 80, quantity },
    });
    await service.command(teacher.code, sellers[i].token, request);
    const reloaded = await new AuctionService(db).view(
      teacher.code,
      sellers[i].token,
    );
    assert.equal(reloaded.study!.market.submitted, true);
    assert.equal(reloaded.study!.market.myOffer!.quantity, quantity);
    assert.equal(reloaded.study!.market.myOffer!.remaining, quantity);
    assert.equal(reloaded.study!.market.myOffer!.price, 80);
  }
  const exported = await service.export(teacher.code, teacher.token);
  assert.equal(
    exported.events.filter((e) => e.type === "posted-offer").length,
    2,
  );
  assert.deepEqual(
    exported.room.study!.markets[0].offers.map((o) => o.quantity),
    [1, 2],
  );
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
  await saveFixture(snapshot.room);
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
  await saveFixture(started.room);
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

test("archived orders append independently, migrate losslessly and resume by cursor", async () => {
  const { teacher, students, send } = await classroom();
  const buyer = students.find((s) => s.view.me.role === "buyer")!;
  await send(teacher.token, { type: "start" });
  for (const price of [50, 51, 52])
    await send(buyer.token, { type: "study-quote", price });
  const initial = await readBundle(db, teacher.code, 1);
  assert.equal(initial.markets[0].state.orderHistory!.length, 2);
  const raw = (
    await db.query<{ state: Record<string, unknown> }>(
      "SELECT state FROM auction_markets WHERE room_code=$1",
      [teacher.code],
    )
  ).rows[0].state;
  assert.equal(raw.orderHistory, undefined);
  const unchanged = await readBundle(db, teacher.code, 1, initial);
  assert.equal(
    unchanged.markets[0].state.orderHistory,
    initial.markets[0].state.orderHistory,
  );
  await send(buyer.token, { type: "study-quote", price: 53 });
  const changed = await readBundle(db, teacher.code, [1], initial);
  assert.equal(changed.markets[0].state.orderHistory!.length, 3);
  assert.equal(
    changed.markets[0].state.orderHistory![0],
    initial.markets[0].state.orderHistory![0],
  );
  assert.deepEqual(
    changed.markets[0].state.orderHistory,
    (await readBundle(db, teacher.code, 1)).markets[0].state.orderHistory,
  );
  const exported = await service.export(teacher.code, teacher.token);
  assert.deepEqual(
    exported.room.study!.markets[0].orderHistory,
    changed.markets[0].state.orderHistory,
  );
  // Reconstruct a version-2 market with embedded historical records.
  await db.transaction(async (tx) => {
    await tx.query("DELETE FROM auction_order_history WHERE room_code=$1", [
      teacher.code,
    ]);
    await tx.query(
      "UPDATE auction_markets SET state=$2::jsonb, history_separated=false, history_cursor=0 WHERE room_code=$1",
      [teacher.code, JSON.stringify(exported.room.study!.markets[0])],
    );
  });
  assert.equal(
    (await service.view(teacher.code, buyer.token)).study!.market.orderHistory
      .length,
    3,
  );
  await send(buyer.token, { type: "study-cancel" });
  const migrated = await service.export(teacher.code, teacher.token);
  assert.equal(migrated.room.study!.markets[0].orderHistory!.length, 4);
  assert.deepEqual(
    migrated.room.study!.markets[0].orderHistory!.slice(0, 3),
    exported.room.study!.markets[0].orderHistory,
  );
  const archived = await db.query(
    "SELECT closed_sequence FROM auction_order_history WHERE room_code=$1",
    [teacher.code],
  );
  assert.equal(archived.rows.length, 4);
});
