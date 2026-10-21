import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import {
  assemble,
  lockBundle,
  readBundle,
  saveBundle,
} from "../src/lib/server/market-store";
import {
  cachedRoomRoot,
  readRoomBundle,
} from "../src/lib/server/room-read-cache";
import { AuctionService } from "../src/lib/server/service";
import { RealtimeBroker } from "../src/lib/server/realtime";
import type { RoomView } from "../src/lib/types";

const pg = new PGlite();
const base = localDatabase(pg);
let bytes = 0,
  reads = 0,
  unavailable = false;
const db: Database = {
  ...base,
  listen: undefined,
  async query<T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) {
    if (unavailable) throw new Error("database unavailable");
    const result = await base.query<T>(text, params);
    reads++;
    bytes += Buffer.byteLength(JSON.stringify(result.rows));
    return result;
  },
};
const svc = new AuctionService(db);
// Separate application instance: writes cannot update the first one's cache.
const external = new AuctionService(base);
before(() => migrate(base));
after(() => pg.close());

async function fixture() {
  const teacher = await svc.create(
    {
      title: "Transfer regression",
      protocol: "institutions-v1",
      markets: 2,
      marketSize: 2,
      capacity: 4,
      rounds: 1,
      duration: 180,
      studyInstitutions: ["cda"],
      studyPeriods: { cda: 1 },
    },
    "Local-transfer-only",
    "",
  );
  const student = await svc.join(teacher.code, "local", "123456");
  return { teacher, student };
}

test("unchanged snapshots validate every row but transfer only revisions; updates without a logical version bump remain visible", async () => {
  const { teacher } = await fixture();
  bytes = reads = 0;
  const initial = await readRoomBundle(db, teacher.code);
  const fullBytes = bytes;
  bytes = reads = 0;
  const same = await readRoomBundle(db, teacher.code);
  assert.equal(
    reads,
    1,
    "a fresh SQL snapshot is mandatory even on a cache hit",
  );
  assert.ok(bytes < fullBytes / 5, `${bytes} versus ${fullBytes} bytes`);
  assert.equal(same.root, initial.root);
  assert.equal(same.markets[0], initial.markets[0]);
  assert.ok(same.now >= initial.now);

  // Storage transitions and administrative SQL can update a row without changing
  // the public version. The physical row revision must still invalidate it.
  await base.query(
    "UPDATE auction_rooms SET state=jsonb_set(state, '{config,title}', '\"Updated externally\"') WHERE code=$1",
    [teacher.code],
  );
  await base.query(
    "UPDATE auction_markets SET state=jsonb_set(state, '{remainingMs}', '12000') WHERE room_code=$1 AND market_id=2",
    [teacher.code],
  );
  const updated = await readRoomBundle(db, teacher.code);
  assert.equal(updated.root.version, initial.root.version);
  assert.equal(updated.root.config.title, "Updated externally");
  assert.equal(updated.markets[0], initial.markets[0]);
  assert.equal(updated.markets[1].state.remainingMs, 12000);
  assert.notEqual(updated.markets[1], initial.markets[1]);
  assert.deepEqual(
    assemble(updated),
    assemble(await readBundle(base, teacher.code)),
  );
});

test("partial reads and reused market IDs cannot retain removed or replaced markets", async () => {
  const { teacher } = await fixture();
  const initial = await readRoomBundle(db, teacher.code);
  await base.transaction(async (tx) => {
    await tx.query(
      "DELETE FROM auction_markets WHERE room_code=$1 AND market_id=2",
      [teacher.code],
    );
    await tx.query(
      "INSERT INTO auction_markets (room_code,market_id,state,version) VALUES ($1,2,$2::jsonb,$3)",
      [
        teacher.code,
        JSON.stringify({ ...initial.markets[1].state, remainingMs: 9876 }),
        initial.markets[1].version,
      ],
    );
  });
  await readRoomBundle(db, teacher.code, 1);
  const changed = await readRoomBundle(db, teacher.code);
  assert.equal(changed.markets[1].state.remainingMs, 9876);
  await base.query(
    "DELETE FROM auction_markets WHERE room_code=$1 AND market_id=2",
    [teacher.code],
  );
  await readRoomBundle(db, teacher.code, [2]);
  assert.deepEqual(
    (await readRoomBundle(db, teacher.code)).markets.map((m) => m.market_id),
    [1],
  );
});

test("rolled-back transactions cannot mutate a shared root snapshot or publish it", async () => {
  const { teacher } = await fixture();
  const before = await readRoomBundle(db, teacher.code);
  const original = structuredClone(before);
  await assert.rejects(
    base.transaction(async (tx) => {
      const bundle = await lockBundle(
        tx,
        teacher.code,
        undefined,
        false,
        cachedRoomRoot(db, teacher.code),
      );
      bundle.root.config.title = "Must not escape rollback";
      const room = assemble(bundle);
      await saveBundle(tx, bundle, room, []);
      throw new Error("rollback");
    }),
    /rollback/,
  );
  assert.deepEqual(before, original);
  assert.equal(
    (await svc.view(teacher.code, teacher.token)).config.title,
    original.root.config.title,
  );
});

test("warm caches still reject revoked credentials, missing rooms and database failures", async () => {
  const { teacher, student } = await fixture();
  await svc.view(teacher.code, teacher.token);
  const renewed = await external.recoverTeacher(
    teacher.code,
    "Local-transfer-only",
  );
  await assert.rejects(svc.view(teacher.code, teacher.token), { status: 401 });
  assert.equal(
    (await svc.view(teacher.code, renewed.token)).me.role,
    "teacher",
  );
  await assert.rejects(svc.view(teacher.code, student.token, "teacher"), {
    status: 401,
  });
  unavailable = true;
  try {
    await assert.rejects(
      svc.view(teacher.code, renewed.token),
      /database unavailable/,
    );
  } finally {
    unavailable = false;
  }
  await external.deleteRoom(teacher.code, "");
  await assert.rejects(svc.view(teacher.code, renewed.token), { status: 404 });
  const other = await fixture();
  await assert.rejects(svc.view(other.teacher.code, renewed.token), {
    status: 401,
  });
});

test("new SSE subscribers reuse verified data without transferring the whole classroom or exposing teacher data", async () => {
  const { teacher, student } = await fixture();
  bytes = 0;
  await readBundle(db, teacher.code);
  const fullBytes = bytes;
  const realtime = new RealtimeBroker(db);
  const stops: (() => void)[] = [];
  try {
    stops.push(await realtime.subscribe(teacher.code, teacher.token, () => {}));
    let snapshot: RoomView | undefined;
    bytes = reads = 0;
    stops.push(
      await realtime.subscribe(teacher.code, student.token, (event) => {
        if (event.type === "snapshot") snapshot = event.data as RoomView;
      }),
    );
    assert.ok(reads >= 1);
    assert.ok(bytes < fullBytes / 5, `${bytes} versus ${fullBytes} bytes`);
    assert.equal(
      snapshot!.me.role,
      (await svc.view(teacher.code, student.token)).me.role,
    );
    assert.notEqual(snapshot!.me.role, "teacher");
    assert.equal(snapshot!.study!.teacher, undefined);
    assert.ok(!JSON.stringify(snapshot).includes("tokenHash"));
  } finally {
    stops.forEach((stop) => stop());
    await realtime.close();
  }
});
