import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyBookChart } from "../src/components/study-order-book";
import { studyPriceLevels } from "../src/lib/study-order-book";
import type { StudyOrder } from "../src/lib/study-types";
import { DemoSession } from "../src/lib/demo";

function order(
  side: StudyOrder["side"],
  price: number,
  sequence: number,
  participantId = `participant-${sequence}`,
): StudyOrder {
  return {
    id: `order-${sequence}`,
    participantId,
    alias: `${side === "buyer" ? "買" : "売"}${sequence}`,
    side,
    price,
    unit: 1,
    sequence,
    at: sequence,
  };
}

test("CDA price levels sum equal prices, sort best prices first, preserve time priority and do not mutate live orders", () => {
  const orders = [
    order("buyer", 80, 5),
    order("seller", 120, 3),
    order("buyer", 100, 4),
    order("buyer", 100, 1, "me"),
    order("seller", 110, 2),
    order("seller", 110, 6),
  ];
  const before = structuredClone(orders);
  assert.deepEqual(studyPriceLevels(orders, "buyer", "me"), [
    { price: 100, quantity: 2, ownQuantity: 1, aliases: "買1・買4" },
    { price: 80, quantity: 1, ownQuantity: 0, aliases: "買5" },
  ]);
  assert.deepEqual(studyPriceLevels(orders, "seller", "me"), [
    { price: 110, quantity: 2, ownQuantity: 0, aliases: "売2・売6" },
    { price: 120, quantity: 1, ownQuantity: 0, aliases: "売3" },
  ]);
  assert.deepEqual(orders, before);
  assert.deepEqual(studyPriceLevels([], "buyer", "me"), []);
});

test("CDA charts use proportional quantities on a shared scale and identify the participant's included order", () => {
  const orders = [
    order("buyer", 100, 1, "me"),
    order("buyer", 100, 2),
    order("seller", 120, 3),
    order("seller", 100, 4),
  ];
  const html = renderToStaticMarkup(
    createElement(StudyBookChart, {
      sides: [
        {
          side: "buyer",
          label: "買い注文",
          rows: studyPriceLevels(orders, "buyer", "me"),
        },
        {
          side: "seller",
          label: "売り注文",
          rows: studyPriceLevels(orders, "seller", "me"),
        },
      ],
      slots: 8,
      maximum: 4,
    }),
  );
  assert.match(
    html,
    /aria-label="100円、買い2単位、売り1単位、あなたの注文1単位を含む"/,
  );
  assert.match(html, /aria-label="120円、買い0単位、売り1単位"/);
  assert.deepEqual(
    [...html.matchAll(/class="study-book-chart-price">(\d+)/g)].map((match) =>
      Number(match[1]),
    ),
    [120, 100],
  );
  assert.match(html, /style="width:50%"/);
  assert.match(html, /style="width:25%"/);
  assert.doesNotMatch(html, /participant-|買1・買2/);
});

test("CDA display levels follow successful price replacements, cancellations and matched trades", async () => {
  const session = new DemoSession("cda", "buyer", 1000);
  await session.command({ type: "start" }, true);
  const levels = () => {
    const { view } = session.getSnapshot();
    return studyPriceLevels(view.study!.market.orders, "buyer", view.me.id);
  };
  assert.equal(await session.command({ type: "study-quote", price: 80 }), true);
  assert.deepEqual(
    levels().map((row) => row.price),
    [80],
  );
  assert.equal(await session.command({ type: "study-quote", price: 85 }), true);
  assert.deepEqual(
    levels().map((row) => row.price),
    [85],
  );
  assert.equal(await session.command({ type: "study-cancel" }), true);
  assert.deepEqual(levels(), []);

  session.advanceTime(4);
  const ask = session
    .getSnapshot()
    .view.study!.market.orders.find((o) => o.side === "seller");
  assert.ok(ask);
  assert.equal(
    await session.command({ type: "study-quote", price: ask.price }),
    true,
  );
  assert.ok(session.getSnapshot().view.study!.myTrades.length > 0);
  assert.ok(levels().every((row) => row.ownQuantity === 0));
});
