import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoSession, DEMO_SETTINGS } from "../src/lib/demo";
import { newStudy } from "../src/lib/server/study";

test("demo supplies 12 balanced markets and 191 virtual participants, keeps formal conditions separate and preserves the human when switching views", async () => {
  const demo = new DemoSession("cda", "buyer", 1000);
  assert.notDeepEqual(DEMO_SETTINGS, newStudy(1).settings);
  const human = demo.getSnapshot().view.me.id;
  assert.equal(demo.getSnapshot().view.participantCount, 192);
  assert.equal(demo.getSnapshot().view.study!.teacher, undefined);
  demo.toggleTeacher();
  const teacher = demo.getSnapshot().view.study!.teacher!;
  const people = teacher.participants;
  assert.equal(teacher.markets.length, 12);
  assert.equal(people.filter((p) => p.role === "buyer").length, 96);
  assert.equal(people.filter((p) => p.role === "seller").length, 96);
  assert.equal(
    people.filter((p) => p.nickname.startsWith("仮想参加者")).length,
    191,
  );
  assert.equal(people.find((p) => p.id === human)!.nickname, "あなた");
  assert.equal(people.find((p) => p.id === human)!.market, 1);
  const orders = new Map<string, number>();
  for (const market of teacher.markets) {
    const participants = people.filter((p) => p.market === market.id);
    assert.equal(participants.filter((p) => p.role === "buyer").length, 8);
    assert.equal(participants.filter((p) => p.role === "seller").length, 8);
    assert.equal(
      participants.filter((p) => p.nickname.startsWith("仮想参加者")).length,
      market.id === 1 ? 15 : 16,
    );
    orders.set(market.order.join(), (orders.get(market.order.join()) ?? 0) + 1);
  }
  assert.equal(orders.size, 6);
  assert.ok([...orders.values()].every((count) => count === 2));
  await demo.command({ type: "start" }, true);
  demo.toggleTeacher();
  assert.equal(demo.getSnapshot().view.me.id, human);
  assert.equal(demo.getSnapshot().view.round, 1);
  assert.equal(demo.getSnapshot().view.study!.teacher, undefined);
});

test("CDA demo trades two marginal units through the real engine without bots ever acting for the human", async () => {
  for (const role of ["buyer", "seller"] as const) {
    const demo = new DemoSession("cda", role, 1000);
    assert.equal(await demo.command({ type: "start" }, true), true);
    let profit = 0;
    for (let unit = 0; unit < 2; unit++) {
      const state = demo.getSnapshot().view;
      const order = state
        .study!.market.orders.filter((o) => o.side !== role)
        .sort((a, b) =>
          role === "buyer" ? a.price - b.price : b.price - a.price,
        )[0];
      assert.ok(order);
      profit +=
        role === "buyer"
          ? state.study!.unitLimits![unit] - order.price
          : order.price - state.study!.unitLimits![unit];
      assert.equal(
        await demo.command({ type: "study-accept", orderId: order.id }),
        true,
      );
      demo.tick(1000);
      demo.tick(1000);
    }
    assert.equal(demo.getSnapshot().view.me.profit, profit);
    assert.equal(demo.getSnapshot().view.study!.unitsUsed, 2);
    assert.equal(await demo.command({ type: "study-quote", price: 90 }), false);
    assert.equal(demo.getSnapshot().view.study!.myTrades.length, 2);
  }
  const idle = new DemoSession("cda", "buyer", 1000);
  await idle.command({ type: "start" }, true);
  for (let i = 0; i < 100; i++) idle.tick(1000);
  assert.ok(idle.getSnapshot().view.study!.market.trades.length > 0);
  assert.equal(idle.getSnapshot().view.study!.unitsUsed, 0);
});

test("Call demo keeps orders sealed, clears uniformly, retains unit limits across calls and rolls back invalid orders", async () => {
  const demo = new DemoSession("call", "buyer", 1000);
  await demo.command({ type: "start" }, true);
  assert.deepEqual(demo.getSnapshot().view.study!.market.orders, []);
  assert.equal(
    await demo.command({ type: "call-submit", prices: [100, 120] }),
    false,
  );
  assert.equal(demo.getSnapshot().view.study!.market.submitted, false);
  assert.equal(
    await demo.command({ type: "call-submit", prices: [160, 140] }),
    true,
  );
  demo.skipStage();
  const view = demo.getSnapshot().view;
  const trades = view.study!.market.trades;
  assert.ok(trades.length > 0);
  assert.equal(new Set(trades.map((t) => t.price)).size, 1);
  assert.equal(view.study!.market.call, 2);
  assert.equal(view.study!.unitsUsed, 2);
  assert.equal(
    trades.some((t) => "value" in t || "cost" in t),
    false,
  );
  assert.equal(
    await demo.command({ type: "call-submit", prices: [140] }),
    false,
  );
  for (let i = 0; i < 3; i++) demo.skipStage();
  assert.equal(demo.getSnapshot().view.study!.market.round, 2);
  assert.equal(demo.getSnapshot().view.phase, "running");
  assert.equal(demo.getSnapshot().view.study!.unitsUsed, 0);
  assert.equal(demo.getSnapshot().view.study!.market.call, 1);
});

test("Call demo lets either human role abstain in all four calls and resets the choice for the next period", async () => {
  for (const role of ["buyer", "seller"] as const) {
    const demo = new DemoSession("call", role, 1000);
    await demo.command({ type: "start" }, true);
    for (let call = 1; call <= 4; call++) {
      assert.equal(demo.getSnapshot().view.study!.market.call, call);
      assert.equal(
        await demo.command({ type: "call-submit", prices: [] }),
        true,
      );
      const view = demo.getSnapshot().view;
      assert.equal(view.study!.market.submitted, true);
      assert.deepEqual(view.study!.market.myOrders, []);
      assert.equal(view.study!.unitsUsed, 0);
      assert.equal(view.me.profit, 0);
      assert.equal(
        await demo.command({ type: "call-submit", prices: [] }),
        false,
      );
      demo.skipStage();
    }
    const next = demo.getSnapshot().view;
    assert.equal(next.study!.market.round, 2);
    assert.equal(next.study!.market.call, 1);
    assert.equal(next.study!.market.submitted, false);
    assert.equal(next.study!.unitsUsed, 0);
    assert.deepEqual(next.study!.myTrades, []);
    assert.equal(
      await demo.command({
        type: "call-submit",
        prices: next.study!.unitLimits!,
      }),
      true,
    );
  }
});

test("all 12 demo markets finish 15 periods with isolated trades and all Call clearings, without submitting orders for the human", async () => {
  const demo = new DemoSession("cda", "buyer", 1000);
  const human = demo.getSnapshot().view.me.id;
  demo.toggleTeacher();
  assert.equal(await demo.command({ type: "start" }), true);
  demo.advanceTime(3000);
  const view = demo.getSnapshot().view;
  assert.equal(view.phase, "finished");
  assert.equal(view.round, 15);
  const teacher = view.study!.teacher!;
  assert.equal(teacher.metrics.length, 180);
  const people = new Map(teacher.participants.map((p) => [p.id, p]));
  for (let round = 1; round <= 15; round++) {
    for (const market of teacher.markets) {
      assert.equal(market.stage, "done");
      assert.equal(market.round, 15);
      const metric = teacher.metrics.find(
        (row) => row.market === market.id && row.round === round,
      )!;
      assert.equal(metric.completion, "complete");
      assert.ok(metric.quantity > 0);
      const trades = market.trades.filter((trade) => trade.round === round);
      assert.equal(metric.quantity, trades.length);
      for (const trade of trades) {
        assert.equal(people.get(trade.buyerId)!.market, market.id);
        assert.equal(people.get(trade.sellerId)!.market, market.id);
        assert.notEqual(trade.buyerId, human);
        assert.notEqual(trade.sellerId, human);
      }
      if (metric.institution === "call") {
        const clearings = market.clearings.filter((row) => row.round === round);
        assert.deepEqual(
          clearings.map((row) => row.call),
          [1, 2, 3, 4],
        );
        assert.equal(
          metric.quantity,
          clearings.reduce((sum, row) => sum + row.quantity, 0),
        );
      }
    }
  }
  demo.toggleTeacher();
  assert.equal(demo.getSnapshot().view.me.id, human);
  assert.equal(demo.getSnapshot().view.study!.unitsUsed, 0);
  assert.deepEqual(demo.getSnapshot().view.study!.myTrades, []);
});

test("Posted demo skips preceding bot buyers, preserves human stock and uses actual published offers", async () => {
  // Repeat to exercise different random positions in the buyer queue.
  for (let run = 0; run < 12; run++) {
    const demo = new DemoSession("posted", "buyer", 1000);
    await demo.command({ type: "start" }, true);
    assert.deepEqual(demo.getSnapshot().view.study!.market.offers, []);
    demo.skipToHuman();
    let state = demo.getSnapshot().view.study!;
    assert.equal(state.market.activeBuyer, "買01");
    assert.equal(state.unitsUsed, 0);
    assert.equal(state.market.remainingMs, 10000);
    for (let unit = 0; unit < 2; unit++) {
      state = demo.getSnapshot().view.study!;
      const offer = state.market.offers.find((o) => o.remaining > 0)!;
      assert.ok(offer);
      assert.equal(
        await demo.command({
          type: "posted-buy",
          offerId: offer.id,
          quantity: 1,
        }),
        true,
      );
    }
    assert.equal(demo.getSnapshot().view.study!.myTrades.length, 2);
    assert.equal(
      demo.getSnapshot().view.study!.unitsUsed,
      demo.getSnapshot().view.study!.market.round === 1 ? 2 : 0,
    );
    assert.notEqual(demo.getSnapshot().view.study!.market.activeBuyer, "買01");
  }
});

test("demo shows different market periods and clocks without rejecting a human in a slower market", async () => {
  const demo = new DemoSession("cda", "buyer", 1000);
  await demo.command({ type: "start" }, true);
  demo.advanceTime(120);
  assert.equal(demo.getSnapshot().view.round, 1);
  assert.equal(await demo.command({ type: "study-quote", price: 100 }), true);
  demo.toggleTeacher();
  const markets = demo.getSnapshot().view.study!.teacher!.markets;
  assert.equal(markets.find((m) => m.id === 1)!.round, 1);
  assert.ok(markets.some((m) => m.round === 2));
  assert.ok(new Set(markets.map((m) => m.remainingMs)).size > 1);
  await demo.command({ type: "pause" });
  const paused = demo.getSnapshot();
  demo.advanceTime(30);
  demo.tick(1000);
  assert.equal(demo.getSnapshot(), paused);
});

test("Posted seller can sell both units to bots; pause stops the clock and bot actions; reset removes all prior data", async () => {
  const demo = new DemoSession("posted", "seller", 1000);
  await demo.command({ type: "start" }, true);
  assert.equal(
    await demo.command({ type: "posted-offer", price: 65, quantity: 2 }),
    true,
  );
  demo.skipStage();
  await demo.command({ type: "pause" }, true);
  const paused = demo.getSnapshot();
  demo.tick(10000);
  demo.skipStage();
  assert.equal(demo.getSnapshot(), paused);
  await demo.command({ type: "resume" }, true);
  for (let i = 0; i < 4; i++) demo.tick(1000);
  assert.equal(demo.getSnapshot().view.study!.unitsUsed, 2);
  assert.equal(demo.getSnapshot().view.me.profit, 30);
  const oldId = demo.getSnapshot().view.me.id;
  demo.reset("call", "buyer");
  assert.equal(demo.getSnapshot().view.phase, "waiting");
  assert.equal(demo.getSnapshot().view.me.role, "buyer");
  assert.notEqual(demo.getSnapshot().view.me.id, oldId);
  assert.equal(demo.getSnapshot().view.study!.market.institution, "call");
  assert.deepEqual(demo.getSnapshot().view.study!.market.trades, []);
  assert.equal(demo.getSnapshot().view.me.profit, 0);
});
