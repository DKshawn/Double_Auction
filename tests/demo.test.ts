import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoSession, DEMO_SETTINGS } from "../src/lib/demo";
import { newStudy } from "../src/lib/server/study";

test("solo demo supplies 15 virtual participants, keeps formal conditions separate and preserves state when switching views", async () => {
  const demo = new DemoSession("cda", "buyer", 1000);
  assert.notDeepEqual(DEMO_SETTINGS, newStudy(1).settings);
  const human = demo.getSnapshot().view.me.id;
  assert.equal(demo.getSnapshot().view.participantCount, 16);
  assert.equal(demo.getSnapshot().view.study!.teacher, undefined);
  demo.toggleTeacher();
  const people = demo.getSnapshot().view.study!.teacher!.participants;
  assert.equal(people.filter((p) => p.role === "buyer").length, 8);
  assert.equal(people.filter((p) => p.role === "seller").length, 8);
  assert.equal(
    people.filter((p) => p.nickname.startsWith("仮想参加者")).length,
    15,
  );
  assert.equal(people.find((p) => p.id === human)!.nickname, "あなた");
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
  assert.equal(demo.getSnapshot().view.phase, "review");
  await demo.command({ type: "start" }, true);
  assert.equal(demo.getSnapshot().view.study!.unitsUsed, 0);
  assert.equal(demo.getSnapshot().view.study!.market.call, 1);
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
    assert.equal(demo.getSnapshot().view.study!.unitsUsed, 2);
    assert.notEqual(demo.getSnapshot().view.study!.market.activeBuyer, "買01");
  }
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
