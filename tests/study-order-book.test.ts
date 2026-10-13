import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyBookChart } from "../src/components/study-order-book";
import {
  studyBookChartRows,
  studyBookRowCapacity,
  studyPriceLevels,
} from "../src/lib/study-order-book";
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

const crowdedOrders = [
  ...Array.from({ length: 20 }, (_, i) =>
    order("buyer", i + 1, i + 1, i === 0 ? "me" : `buyer-${i}`),
  ),
  ...Array.from({ length: 20 }, (_, i) =>
    order("seller", i + 21, i + 21, i === 16 ? "me" : `seller-${i}`),
  ),
  order("buyer", 1, 41),
  order("seller", 40, 42),
];
const crowdedBuyers = studyPriceLevels(crowdedOrders, "buyer", "me");
const crowdedSellers = studyPriceLevels(crowdedOrders, "seller", "me");

test("crowded CDA charts retain the best bid/ask and aggregate strictly above/below the visible prices", () => {
  const before = structuredClone([crowdedBuyers, crowdedSellers]);
  const rows = studyBookChartRows(crowdedBuyers, crowdedSellers, 4);
  assert.deepEqual(
    rows.map(({ kind, price }) => [kind, price]),
    [
      ["above", 21],
      ["price", 21],
      ["price", 20],
      ["below", 20],
    ],
  );
  assert.deepEqual(rows[0].seller, { quantity: 20, ownQuantity: 1 });
  assert.deepEqual(rows[0].buyer, { quantity: 0, ownQuantity: 0 });
  assert.equal(rows[1].seller?.quantity, 1);
  assert.equal(rows[2].buyer?.quantity, 1);
  assert.deepEqual(rows[3].buyer, { quantity: 20, ownQuantity: 1 });
  assert.deepEqual(rows[3].seller, { quantity: 0, ownQuantity: 0 });
  assert.deepEqual([crowdedBuyers, crowdedSellers], before);
});

test("CDA row budgets conserve every quantity and own order as the available height and sides change", () => {
  assert.equal(studyBookRowCapacity(96), 4);
  assert.equal(studyBookRowCapacity(191.9), 7);
  assert.equal(studyBookRowCapacity(192), 8);
  assert.equal(studyBookRowCapacity(480), 20);
  for (const [buyers, sellers] of [
    [crowdedBuyers, crowdedSellers],
    [crowdedBuyers, []],
    [[], crowdedSellers],
    [[], []],
  ]) {
    for (let capacity = 4; capacity <= 45; capacity++) {
      const rows = studyBookChartRows(buyers, sellers, capacity);
      assert.ok(rows.length <= capacity);
      const details = rows.filter((row) => row.kind === "price");
      assert.deepEqual(
        details.map((row) => row.price),
        details.map((row) => row.price).sort((a, b) => b - a),
      );
      if (buyers.length)
        assert.ok(details.some((row) => row.price === buyers[0].price));
      if (sellers.length)
        assert.ok(details.some((row) => row.price === sellers[0].price));
      for (const [side, levels] of [
        ["buyer", buyers],
        ["seller", sellers],
      ] as const)
        for (const key of ["quantity", "ownQuantity"] as const)
          assert.equal(
            rows.reduce((sum, row) => sum + (row[side]?.[key] ?? 0), 0),
            levels.reduce((sum, level) => sum + level[key], 0),
          );
      if (rows[0]?.kind === "above")
        assert.equal(rows[0].price, details[0].price);
      if (rows.at(-1)?.kind === "below")
        assert.equal(rows.at(-1)!.price, details.at(-1)!.price);
      if (buyers.length + sellers.length === 0) assert.deepEqual(rows, []);
    }
  }
});

test("CDA chart summary bars use the combined quantity scale and preserve ownership labels", () => {
  const html = renderToStaticMarkup(
    createElement(StudyBookChart, {
      sides: [
        { side: "buyer", label: "買い注文", rows: crowdedBuyers },
        { side: "seller", label: "売り注文", rows: crowdedSellers },
      ],
      slots: 4,
      maximum: 4,
    }),
  );
  assert.equal((html.match(/role="img"/g) ?? []).length, 4);
  assert.match(
    html,
    /21円より高い注文の合計、買い0単位、売り20単位、あなたの注文1単位を含む/,
  );
  assert.match(
    html,
    /20円より安い注文の合計、買い20単位、売り0単位、あなたの注文1単位を含む/,
  );
  assert.match(html, /&gt; 21/);
  assert.match(html, /&lt; 20/);
  assert.match(html, /style="width:100%"/);
  assert.match(html, /style="width:5%"/);
});
