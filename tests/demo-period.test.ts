import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoSession } from "../src/lib/demo";
import type { Institution } from "../src/lib/study-types";

for (const institution of ["cda", "call", "posted"] as const) {
  test(`${institution}: next-period fast-forward settles the whole period and stops at the start of the next`, async () => {
    const demo = new DemoSession(institution, "buyer", 1000, {
      teacher: true,
      config: {
        title: "次の期の確認",
        protocol: "institutions-v1",
        markets: 1,
        marketSize: 4,
        capacity: 4,
        rounds: 2,
        duration: 20,
        studyInstitutions: [institution],
        studyPeriods: { [institution]: 2 },
        studyTiming: {
          cdaSeconds: 20,
          callSeconds: 5,
          offerSeconds: 5,
          buyerSeconds: 10,
          purchaseSeconds: 20,
        },
      },
    });
    const waiting = demo.getSnapshot();
    demo.skipPeriod(1);
    assert.equal(demo.getSnapshot(), waiting);
    assert.equal(await demo.command({ type: "start" }), true);
    assert.equal(await demo.command({ type: "pause" }), true);
    const paused = demo.getSnapshot();
    demo.skipPeriod(1);
    assert.equal(demo.getSnapshot(), paused);
    assert.equal(await demo.command({ type: "resume" }), true);
    demo.skipPeriod(1);

    const view = demo.getSnapshot().view;
    const market = view.study!.teacher!.markets[0];
    assert.equal(market.round, 2);
    assert.equal(
      market.stage,
      institution === "posted" ? "offer" : institution,
    );
    assert.equal(market.remainingMs, institution === "cda" ? 20000 : 5000);
    const metric = view.study!.teacher!.metrics.find((m) => m.round === 1)!;
    assert.equal(metric.completion, "complete");
    assert.equal(
      metric.quantity,
      market.trades.filter((t) => t.round === 1).length,
    );
    assert.ok(market.trades.every((t) => t.round === 1));
    if (institution === "call")
      assert.deepEqual(
        market.clearings.map((c) => c.call),
        [1, 2, 3, 4],
      );
    const human = view.study!.teacher!.participants.find(
      (p) => p.nickname === "あなた",
    )!;
    assert.ok(
      market.trades.every(
        (t) => t.buyerId !== human.id && t.sellerId !== human.id,
      ),
    );

    demo.skipPeriod(1);
    assert.equal(demo.getSnapshot().view.phase, "finished");
    assert.equal(demo.getSnapshot().view.study!.market.stage, "done");
    assert.ok(
      demo
        .getSnapshot()
        .view.study!.teacher!.metrics.every((m) => m.completion === "complete"),
    );
    const finished = demo.getSnapshot();
    demo.skipPeriod(1);
    assert.equal(demo.getSnapshot(), finished);
  });
}

test("next-period fast-forward crosses institution feedback and preserves the initial countdown", async () => {
  const institutions: Institution[] = ["cda", "call", "posted"];
  const demo = new DemoSession("cda", "buyer", 1000, {
    teacher: true,
    lobby: true,
    config: {
      title: "制度切り替えの確認",
      protocol: "institutions-v1",
      markets: 1,
      marketSize: 4,
      capacity: 4,
      rounds: 3,
      duration: 10,
      studyInstitutions: institutions,
      studyPeriods: { cda: 1, call: 1, posted: 1 },
      studyTiming: {
        cdaSeconds: 10,
        callSeconds: 2,
        offerSeconds: 2,
        buyerSeconds: 3,
      },
    },
  });
  await demo.command({ type: "study-randomize", expectedRevision: 0 });
  await demo.command({ type: "start" });
  const countdown = demo.getSnapshot();
  demo.skipPeriod(1);
  assert.equal(demo.getSnapshot(), countdown);
  demo.advanceTime(5);
  demo.skipPeriod(1);
  let market = demo.getSnapshot().view.study!.market;
  assert.equal(market.round, 2);
  assert.equal(market.institution, "call");
  assert.equal(market.call, 1);
  assert.equal(market.remainingMs, 2000);
  for (let call = 0; call < 4; call++) demo.skipStage();
  assert.equal(demo.getSnapshot().view.study!.market.stage, "feedback");
  demo.skipPeriod(1);
  market = demo.getSnapshot().view.study!.market;
  assert.equal(market.round, 3);
  assert.equal(market.institution, "posted");
  assert.equal(market.stage, "offer");
  assert.equal(market.remainingMs, 2000);
});
