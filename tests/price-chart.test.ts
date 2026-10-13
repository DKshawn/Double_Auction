import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceChart } from "../src/components/price-chart";
import type { Trade } from "../src/lib/types";

function trade(id: string, round: number, price: number): Trade {
  return {
    id,
    round,
    price,
    good: "apple",
    sequence: 1,
    at: 1000,
    buyerId: "b",
    sellerId: "s",
    buyerAlias: "買01",
    sellerAlias: "売01",
  };
}

test("comparison lines never connect different markets or periods, including overlapping trade IDs", () => {
  const html = renderToStaticMarkup(
    createElement(PriceChart, {
      rounds: 2,
      periodAxis: true,
      series: [
        {
          id: "1",
          label: "市場1",
          trades: [trade("a", 1, 90), trade("b", 1, 100), trade("c", 2, 95)],
        },
        {
          id: "2",
          label: "市場2",
          trades: [
            trade("a", 1, 110),
            trade("b", 1, 120),
            trade("c", 1, 130),
            trade("d", 2, 115),
          ],
        },
        { id: "3", label: "市場3", trades: [] },
      ],
    }),
  );
  assert.equal((html.match(/role="img"/g) ?? []).length, 1);
  const first = html.match(/<g aria-label="市場1">([\s\S]*?)<\/g>/)![1];
  const second = html.match(/<g aria-label="市場2">([\s\S]*?)<\/g>/)![1];
  assert.equal((first.match(/<polyline/g) ?? []).length, 1);
  assert.equal((second.match(/<polyline/g) ?? []).length, 1);
  const firstPoints = first.match(/points="([^"]+)"/)![1].split(" ");
  const secondPoints = second.match(/points="([^"]+)"/)![1].split(" ");
  assert.equal(firstPoints.length, 2);
  assert.equal(secondPoints.length, 3);
  // Each market uses its own within-period positions on a shared period axis.
  assert.ok(
    Number(firstPoints[0].split(",")[0]) >
      Number(secondPoints[0].split(",")[0]),
  );
  assert.notEqual(
    first.match(/stroke:([^;\"]+)/)![1],
    second.match(/stroke:([^;\"]+)/)![1],
  );
  assert.match(first, /市場1・第2期：95円/);
  assert.doesNotMatch(first, /市場2・|110円|120円|130円|115円/);
  assert.match(second, /市場2・第2期：115円/);
  assert.doesNotMatch(second, /市場1・|90円|100円|95円/);
  assert.match(html, /市場3<\/li>/);
  assert.equal((html.match(/class="chart-dot"/g) ?? []).length, 7);
});

test("single-market charts retain their labels, period boundaries and empty state without a comparison legend", () => {
  const html = renderToStaticMarkup(
    createElement(PriceChart, {
      trades: [
        trade("1", 1, 90),
        trade("2", 1, 100),
        trade("3", 2, 95),
        trade("4", 2, 105),
      ],
      rounds: 2,
      periodAxis: true,
    }),
  );
  assert.doesNotMatch(html, /price-chart-legend|市場の凡例/);
  assert.equal((html.match(/<polyline/g) ?? []).length, 2);
  assert.equal((html.match(/class="chart-dot"/g) ?? []).length, 4);
  assert.match(html, /<title>第1期：90円<\/title>/);
  assert.match(html, /<title>第2期：105円<\/title>/);
  const empty = renderToStaticMarkup(createElement(PriceChart, { trades: [] }));
  assert.match(empty, /取引が成立すると、ここに価格が表示されます/);
  assert.doesNotMatch(empty, /class="chart-dot"|price-chart-legend/);
});
