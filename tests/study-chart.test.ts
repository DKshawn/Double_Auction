import { test } from "node:test";
import assert from "node:assert/strict";
import { studyChartViewport } from "../src/lib/study-chart";
import { generateStaircase } from "../src/lib/study-generator";
import { pptStudySettings } from "../src/lib/server/study";

const fifty = generateStaircase({ p: 800, K: 8, L: 4, d: 5 }, 50);
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("a 50-unit chart centers the entire 8–12 equilibrium range at price 800", () => {
  const view = studyChartViewport(fifty.demand, fifty.supply);
  assert.equal(view.quantityCenter, 10);
  assert.equal(view.priceCenter, 800);
  close((view.quantityMin + view.quantityMax) / 2, 10);
  close((view.priceMin + view.priceMax) / 2, 800);
  assert.ok(view.quantityMin <= view.eq.quantity);
  assert.ok(view.quantityMax >= view.eq.quantityMax);
  assert.deepEqual(view.eq, fifty.equilibrium);
});

test("zoom preserves the equilibrium center and data; full view contains every unit and price", () => {
  const before = structuredClone(fifty);
  const normal = studyChartViewport(fifty.demand, fifty.supply);
  const full = studyChartViewport(fifty.demand, fifty.supply, normal.minZoom);
  assert.ok(full.quantityMin <= 0 && full.quantityMax >= 50);
  for (const price of [...fifty.demand, ...fifty.supply])
    assert.ok(price >= full.priceMin && price <= full.priceMax);
  let lastWidth = Infinity;
  for (const zoom of [normal.minZoom, 0.5, 1, 2, 8]) {
    const view = studyChartViewport(fifty.demand, fifty.supply, zoom);
    close(
      (view.quantityCenter - view.quantityMin) /
        (view.quantityMax - view.quantityMin),
      0.5,
    );
    close(
      (view.priceCenter - view.priceMin) / (view.priceMax - view.priceMin),
      0.5,
    );
    assert.ok(view.quantityMax - view.quantityMin < lastWidth);
    lastWidth = view.quantityMax - view.quantityMin;
    assert.deepEqual(view.eq, fifty.equilibrium);
  }
  assert.deepEqual(fifty, before);
});

test("Default and an overlap extending to the last unit retain their theoretical benchmarks", () => {
  const ppt = pptStudySettings();
  const demand = ppt.values.flat().sort((a, b) => b - a);
  const supply = ppt.costs.flat().sort((a, b) => a - b);
  const original = studyChartViewport(demand, supply);
  assert.equal(original.priceCenter, 80);
  assert.equal(original.quantityCenter, 10.5);
  assert.equal(original.eq.surplus, 440);
  const edge = generateStaircase({ p: 80, K: 8, L: 8, d: 4 });
  const centered = studyChartViewport(edge.demand, edge.supply);
  const full = studyChartViewport(edge.demand, edge.supply, centered.minZoom);
  assert.ok(full.quantityMin <= 0 && full.quantityMax >= 16);
  assert.equal(full.priceCenter, 80);
  assert.equal(full.quantityCenter, 12);
  assert.deepEqual(full.eq, edge.equilibrium);
});
