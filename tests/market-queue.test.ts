import { test } from "node:test";
import assert from "node:assert/strict";
import { inMarketQueue } from "../src/lib/server/market-queue";
import type { Database } from "../src/lib/server/database";

test("same-market work waits without borrowing a connection; other markets and failures do not block it", async () => {
  const db = {} as Database;
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = inMarketQueue(db, "room", 1, async () => {
    order.push("first");
    await gate;
    throw new Error("rejected command");
  });
  const rejected = assert.rejects(first, /rejected command/);
  const second = inMarketQueue(db, "room", 1, async () => {
    order.push("second");
  });
  await inMarketQueue(db, "room", 2, async () => {
    order.push("other");
  });
  assert.deepEqual(order, ["first", "other"]);
  release();
  await rejected;
  await second;
  await inMarketQueue(db, "room", 1, async () => {
    order.push("after");
  });
  assert.deepEqual(order, ["first", "other", "second", "after"]);
});
