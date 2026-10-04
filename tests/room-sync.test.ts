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
