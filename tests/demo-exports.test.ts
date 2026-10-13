import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoSession } from "../src/lib/demo";
import { AuctionError } from "../src/lib/auction-model";
import { EXPORTS } from "../src/lib/exports";
import type { Institution } from "../src/lib/study-types";

function createDemo(institution: Institution = "cda") {
  return new DemoSession(institution, "buyer", 1000, {
    lobby: true,
    teacher: true,
    config: {
      protocol: "institutions-v1",
      title: "ボタン・ダウンロード確認",
      markets: 2,
      marketSize: 4,
      capacity: 8,
      studyInstitutions: [institution],
      studyPeriods: { [institution]: 1 },
      rounds: 1,
      duration: 60,
      studyTiming: {
        cdaSeconds: 60,
        callSeconds: 5,
        offerSeconds: 5,
        buyerSeconds: 10,
        purchaseSeconds: 30,
      },
    },
  });
}

test("Demo downloads expose the configured simulation, report empty data, and require the teacher view", async () => {
  const demo = createDemo();
  const settings = JSON.parse(demo.exportData("settings").content);
  assert.equal(settings.code, "DEMO");
  assert.deepEqual(settings.config, demo.getSnapshot().view.config);
  assert.equal(settings.participants.length, 8);
  assert.equal(settings.markets.length, 2);
  assert.equal(settings.phase, "waiting");
  assert.doesNotMatch(
    JSON.stringify(settings),
    /teacherTokenHash|teacherPasswordHash|pinHash/,
  );
  for (const { kind, empty } of EXPORTS) {
    if (kind === "settings") continue;
    assert.throws(
      () => demo.exportData(kind),
      (error: unknown) =>
        error instanceof AuctionError &&
        error.status === 422 &&
        error.message === empty,
    );
  }
  // A rejected action must not leak an event into the downloadable audit log.
  assert.equal(await demo.command({ type: "start" }), false);
  assert.throws(() => demo.exportData("events"), /操作ログはまだありません/);
  demo.toggleTeacher();
  for (const { kind } of EXPORTS)
    assert.throws(
      () => demo.exportData(kind),
      (error: unknown) => error instanceof AuctionError && error.status === 403,
    );
});

for (const institution of ["cda", "call", "posted"] as const) {
  test(`Demo ${institution} exports all simulated markets, accepted actions and automatic settlements, then clears data on reset`, async () => {
    const demo = createDemo(institution);
    assert.equal(
      await demo.command({ type: "study-randomize", expectedRevision: 0 }),
      true,
    );
    assert.equal(await demo.command({ type: "start" }), true);
    demo.advanceTime(5);
    demo.advanceTime(institution === "cda" ? 40 : 16);
    assert.equal(await demo.command({ type: "pause" }), true);
    const beforeRejected = demo.exportData("events");
    assert.equal(
      await demo.command({ type: "study-quote", price: 100 }),
      false,
    );
    assert.deepEqual(demo.exportData("events"), beforeRejected);
    assert.equal(await demo.command({ type: "resume" }), true);
    assert.equal(await demo.command({ type: "finish" }), true);

    const teacher = demo.getSnapshot().view.study!.teacher!;
    const allTrades = teacher.markets.flatMap((market) => market.trades);
    assert.ok(allTrades.length > 0);
    assert.equal(new Set(allTrades.map((trade) => trade.market)).size, 2);
    const trades = demo.exportData("trades");
    assert.equal(trades.rowCount, allTrades.length);
    assert.ok(
      allTrades.every((trade) => trades.content.includes(`"${trade.id}"`)),
    );
    const metrics = demo.exportData("metrics");
    assert.equal(metrics.rowCount, teacher.metrics.length);
    const events = demo.exportData("events");
    assert.match(events.content, /participants-randomized/);
    assert.match(events.content, /start-countdown/);
    assert.match(events.content, /paused/);
    assert.match(events.content, /resumed/);
    assert.match(events.content, /trade/);
    for (const result of [trades, metrics, events]) {
      assert.equal(result.extension, "csv");
      assert.equal(result.contentType, "text/csv; charset=utf-8");
      assert.equal(result.content.charCodeAt(0), 0xfeff);
      assert.equal(result.content.split("\r\n").length, result.rowCount! + 1);
    }
    const settings = JSON.parse(demo.exportData("settings").content);
    assert.equal(settings.phase, "finished");
    assert.deepEqual(settings.metrics, teacher.metrics);
    demo.reset();
    assert.throws(() => demo.exportData("trades"), /取引履歴はまだありません/);
    assert.throws(() => demo.exportData("events"), /操作ログはまだありません/);
    assert.equal(
      JSON.parse(demo.exportData("settings").content).phase,
      "waiting",
    );
  });
}
