import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  historyAnchorTop,
  historyOffsets,
  historyRowAt,
  historyWindow,
} from "../src/lib/history-window";
import { timeLabel } from "../src/lib/client";
import { StudyMarketHistory } from "../src/components/study-market-history";
import type { StudyOrderHistory } from "../src/lib/study-types";
import { DemoSession } from "../src/lib/demo";

test("history windows cover every record while bounding mounted rows", () => {
  const ids = Array.from({ length: 6000 }, (_, i) => String(i));
  const offsets = historyOffsets(ids, new Map());
  for (let top = 0; top < offsets.at(-1)!; top += 240) {
    const range = historyWindow(offsets, top, 480);
    assert.ok(range.start <= historyRowAt(offsets, top));
    assert.ok(range.end > historyRowAt(offsets, top + 479));
    assert.ok(range.end - range.start <= 37);
    assert.equal(
      range.before + offsets[range.end] - offsets[range.start] + range.after,
      6000 * 24,
    );
  }
  assert.equal(historyWindow(offsets, 1e9, 480).end, 6000);
  assert.deepEqual(historyWindow([0], 0, 480), {
    start: 0,
    end: 0,
    before: 0,
    after: 0,
  });
});

test("variable-height teacher rows and resize keep the reader on the same record", () => {
  const ids = ["a", "b", "c", "d"];
  const offsets = historyOffsets(ids, new Map([["b", 47.5]]));
  assert.deepEqual(offsets, [0, 24, 71.5, 95.5, 119.5]);
  assert.equal(historyRowAt(offsets, 71.49), 1);
  assert.equal(historyRowAt(offsets, 71.5), 2);
  const anchor = { id: "c", inset: 7 };
  const updated = ["new", ...ids];
  const resized = historyOffsets(updated, new Map([["b", 60]]), 30);
  assert.equal(historyAnchorTop(updated, resized, anchor), 127);
  assert.equal(historyAnchorTop(updated, resized, null), 0);
  assert.equal(historyAnchorTop(["different-market"], [0, 24], anchor), 0);
});

test("a 6000-row history retains its total and mounts only the initial window", () => {
  const orders: StudyOrderHistory[] = Array.from({ length: 6000 }, (_, i) => ({
    id: `history-${i}`,
    participantId: "buyer",
    alias: "買01",
    side: "buyer",
    price: 80,
    unit: 1,
    round: 1,
    sequence: i * 2,
    at: 1000 + i * 1000,
    closedAt: 1500 + i * 1000,
    closedSequence: i * 2 + 1,
    status: "replaced",
  }));
  const html = renderToStaticMarkup(
    createElement(StudyMarketHistory, {
      orders,
      trades: [],
      institution: "cda",
      participantId: "buyer",
    }),
  );
  assert.match(html, /6000件/);
  assert.match(html, /aria-rowcount="6001"/);
  assert.match(html, /data-history-id="order-history-5999"/);
  assert.doesNotMatch(html, /data-history-id="order-history-0"/);
  assert.ok([...html.matchAll(/data-history-id=/g)].length <= 30);
  assert.match(html, /aria-rowindex="2"/);
  assert.match(html, /study-history-spacer/);
  assert.doesNotMatch(html, /study-history-new/);
  assert.equal(orders.length, 6000);
  assert.equal(
    orders[0].id,
    "history-0",
    "rendering must not sort source data",
  );
});

test("shared time formatting preserves Japan time including midnight and cache eviction", () => {
  const midnight = Date.parse("2026-10-13T15:00:00Z");
  assert.equal(timeLabel(midnight - 1000), "23:59:59");
  assert.equal(timeLabel(midnight), "00:00:00");
  assert.equal(timeLabel(midnight + 999), "00:00:00");
  for (let i = 0; i < 2100; i++) timeLabel(midnight + i * 1000);
  assert.equal(timeLabel(midnight), "00:00:00");
});

test("demo clock ticks reuse history for students and teachers, but new orders and reset do not", async () => {
  const demo = new DemoSession("cda", "buyer", 1000);
  await demo.command({ type: "start" }, true);
  await demo.command({ type: "study-quote", price: 1 });
  await demo.command({ type: "study-quote", price: 2 });
  const before = demo.getSnapshot().view.study!.market;
  assert.equal(before.orderHistory.length, 1);
  demo.tick(250);
  const after = demo.getSnapshot().view.study!.market;
  assert.equal(after.orderHistory, before.orderHistory);
  assert.equal(after.trades, before.trades);
  assert.equal(after.clearings, before.clearings);
  assert.equal(after.offerHistory, before.offerHistory);
  assert.ok(after.remainingMs < before.remainingMs);
  demo.toggleTeacher();
  const teacherBefore = demo.getSnapshot().view.study!.teacher!;
  demo.tick(250);
  const teacherAfter = demo.getSnapshot().view.study!.teacher!;
  for (let i = 0; i < teacherBefore.markets.length; i++)
    assert.equal(
      teacherAfter.markets[i].orderHistory,
      teacherBefore.markets[i].orderHistory,
    );
  await demo.command({ type: "study-quote", price: 3 }, false);
  assert.equal(demo.getSnapshot().view.study!.market.orderHistory.length, 2);
  assert.equal(before.orderHistory.length, 1);
  demo.reset();
  assert.equal(demo.getSnapshot().view.study!.market.orderHistory.length, 0);
});
