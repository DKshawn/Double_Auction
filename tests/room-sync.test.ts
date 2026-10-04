import { test } from "node:test";
import assert from "node:assert/strict";
import { diffViews, applyPatch } from "../src/lib/room-sync";
import type { RoomView } from "../src/lib/types";
import { assertLocalDatabaseUrl } from "../src/lib/server/database";

test("patches append history, replace live books and remove optional fields without mutating the base", () => {
  const before = {
    version: 1,
    trades: [{ id: "a", price: 80 }],
    quotes: [{ id: "q", price: 70 }],
    teacher: { participants: [] },
  } as unknown as RoomView;
  const after = {
    version: 2,
    trades: [
      { id: "a", price: 80 },
      { id: "b", price: 85 },
    ],
    quotes: [],
  } as unknown as RoomView;
  const saved = structuredClone(before);
  const patch = diffViews(before, after);
  assert.deepEqual(applyPatch(before, patch), after);
  assert.deepEqual(before, saved);
  assert.ok(
    patch.changes.some(
      (c) => c.op === "splice" && c.path[0] === "trades" && c.start === 1,
    ),
  );
  assert.throws(() => applyPatch(after, patch), /Snapshot/);
  assert.throws(
    () =>
      applyPatch(before, {
        base: 1,
        version: 2,
        changes: [{ op: "set", path: ["__proto__", "polluted"], value: true }],
      }),
    /Invalid/,
  );
});

test("a long unchanged history is not retransmitted for one new trade", () => {
  const before = {
    version: 8,
    trades: Array.from({ length: 1000 }, (_, id) => ({
      id,
      price: 80,
      at: id,
    })),
  } as unknown as RoomView;
  const after = {
    ...before,
    version: 9,
    trades: [...before.trades, { id: 1001, price: 82, at: 1001 }],
  } as unknown as RoomView;
  const patch = diffViews(before, after);
  assert.deepEqual(applyPatch(before, patch), after);
  assert.ok(JSON.stringify(patch).length < JSON.stringify(after).length / 50);
});

test("local database guard rejects cloud URLs and non-PostgreSQL protocols", () => {
  assertLocalDatabaseUrl("postgresql://test:local@127.0.0.1:55433/test");
  assertLocalDatabaseUrl("postgres://test@localhost/test");
  for (const url of [
    "postgres://db.example.com/test",
    "https://localhost/test",
    "postgres://127.0.0.1.example.com/test",
  ])
    assert.throws(() => assertLocalDatabaseUrl(url), /loopback/);
});

test("applying nested patches copies changed paths only, including repeated splices", () => {
  const before = {
    version: 1,
    quotes: [{ price: 50 }],
    trades: [{ price: 80 }],
    study: {
      market: { orders: [{ price: 70 }], orderHistory: [{ price: 60 }] },
    },
  } as unknown as RoomView;
  const saved = structuredClone(before);
  const patch: import("../src/lib/room-sync").RoomPatch = {
    base: 1,
    version: 2,
    changes: [
      { op: "set", path: ["version"], value: 2 },
      { op: "set", path: ["study", "market", "orders", 0, "price"], value: 75 },
      {
        op: "splice",
        path: ["study", "market", "orderHistory"],
        start: 1,
        deleteCount: 0,
        items: [{ price: 61 }],
      },
      {
        op: "splice",
        path: ["study", "market", "orderHistory"],
        start: 2,
        deleteCount: 0,
        items: [{ price: 62 }],
      },
    ],
  };
  const after = applyPatch(before, patch);
  assert.deepEqual(before, saved);
  assert.equal(after.trades, before.trades);
  assert.equal(
    after.study!.market.orderHistory[0],
    before.study!.market.orderHistory[0],
  );
  assert.equal(after.study!.market.orderHistory.length, 3);
  assert.equal(after.study!.market.orders[0].price, 75);
  assert.notEqual(after.study!.market.orders, before.study!.market.orders);
});

test("shifted live books use a compact replacement while histories still append", () => {
  const quotes = Array.from({ length: 16 }, (_, i) => ({
    id: `order-${i}`,
    participantId: `participant-${i}`,
    side: "buyer" as const,
    good: "apple" as const,
    round: 1,
    price: 80 + i,
    at: i,
    alias: `buyer-${i}`,
    sequence: i,
    quantity: 1,
  }));
  const before = { version: 1, quotes, trades: [] } as unknown as RoomView;
  const after = { ...before, version: 2, quotes: quotes.slice(1) };
  const patch = diffViews(before, after);
  assert.deepEqual(applyPatch(before, patch), after);
  assert.ok(
    patch.changes.some((c) => c.op === "set" && c.path[0] === "quotes"),
  );
  assert.ok(JSON.stringify(patch).length < JSON.stringify(after).length + 180);
});
