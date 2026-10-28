import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  localDatabase,
  migrate,
  postgresDatabase,
  SCHEMA,
  type Database,
} from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { lockBundle, saveBundle } from "../src/lib/server/market-store";
import type { Command, CommandRequest } from "../src/lib/types";

const pg = new PGlite();
const db = localDatabase(pg);
before(() => migrate(db));
after(() => pg.close());

test("adding receipt storage to the previous schema leaves historical room, market and audit JSON unchanged", async () => {
  const previousPg = new PGlite();
  const previous = localDatabase(previousPg);
  try {
    for (const statement of SCHEMA.filter(
      (sql) =>
        !sql.includes("receipt_count") &&
        !sql.includes("auction_market_receipts"),
    ))
      await previous.query(statement);
    const room = {
      title: "歴史実験",
      phase: "finished",
      receipts: [{ actor: "teacher", requestId: "old-teacher" }],
    };
    const market = {
      stage: "done",
      trades: [{ id: "old-trade", price: 81, at: 1000 }],
      periods: [{ completion: "complete" }],
    };
    const receipts = [{ actor: "old-student", requestId: "old-request" }];
    const event = {
      type: "trade",
      sequence: 1,
      at: 1000,
      detail: { price: 81 },
    };
    await previous.query(
      "INSERT INTO auction_rooms(code,state) VALUES ('ABCD23',$1::jsonb)",
      [JSON.stringify(room)],
    );
    await previous.query(
      "INSERT INTO auction_markets(room_code,market_id,state,receipts) VALUES ('ABCD23',1,$1::jsonb,$2::jsonb)",
      [JSON.stringify(market), JSON.stringify(receipts)],
    );
    await previous.query(
      "INSERT INTO auction_market_events(room_code,market_id,sequence,event) VALUES ('ABCD23',1,1,$1::jsonb)",
      [JSON.stringify(event)],
    );
    const snapshot = async () =>
      (
        await previous.query(`SELECT r.state AS room,r.updated_at,
      m.state AS market,m.receipts,e.event FROM auction_rooms r
      JOIN auction_markets m ON m.room_code=r.code
      JOIN auction_market_events e ON e.room_code=m.room_code AND e.market_id=m.market_id`)
      ).rows;
    const before = await snapshot();
    await migrate(previous);
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      (
        await previous.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM auction_market_receipts",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await previous.query<{ receipt_count: number }>(
          "SELECT receipt_count FROM auction_markets",
        )
      ).rows[0].receipt_count,
      0,
    );
  } finally {
    await previousPg.close();
  }
});

async function fixture(database = db) {
  const service = new AuctionService(database);
  const teacher = await service.create(
    {
      title: "Receipt isolation",
      protocol: "institutions-v1",
      markets: 1,
      marketSize: 2,
      capacity: 2,
      rounds: 1,
      duration: 180,
      studyInstitutions: ["cda"],
      studyPeriods: { cda: 1 },
    },
    "Local-receipts-only",
    "",
  );
  const saved = await service.export(teacher.code, teacher.token);
  delete saved.room.study!.lobby;
  await database.transaction(async (tx) =>
    saveBundle(tx, await lockBundle(tx, teacher.code), saved.room, []),
  );
  const people = await Promise.all(
    [0, 1].map((i) => service.join(teacher.code, `学生${i}`, "123456")),
  );
  const makeRequest = async (
    token: string,
    command: Command,
  ): Promise<CommandRequest> => {
    const view = await service.view(teacher.code, token);
    return {
      requestId: randomUUID(),
      expectedRound: view.round,
      expectedStage: view.study!.market.stageKey,
      command,
    };
  };
  await service.command(
    teacher.code,
    teacher.token,
    await makeRequest(teacher.token, { type: "start" }),
  );
  const students = await Promise.all(
    people.map(async (person) => ({
      ...person,
      view: await service.view(teacher.code, person.token),
    })),
  );
  const buyer = students.find((p) => p.view.me.role === "buyer")!;
  const seller = students.find((p) => p.view.me.role === "seller")!;
  return { service, teacher, buyer, seller, makeRequest };
}

test("new market commands append receipt keys without growing legacy JSON; exports and retries preserve all receipts", async () => {
  const f = await fixture();
  const requests: CommandRequest[] = [];
  for (let i = 0; i < 30; i++) {
    const request = await f.makeRequest(f.buyer.token, {
      type: "study-quote",
      price: 50 + (i % 5),
    });
    requests.push(request);
    await f.service.command(f.teacher.code, f.buyer.token, request);
  }
  const stored = (
    await db.query<{ receipts: unknown[]; receipt_count: number }>(
      "SELECT receipts,receipt_count FROM auction_markets WHERE room_code=$1",
      [f.teacher.code],
    )
  ).rows[0];
  assert.deepEqual(stored.receipts, []);
  assert.equal(stored.receipt_count, 30);
  const snapshot = await f.service.export(f.teacher.code, f.teacher.token);
  assert.equal(
    snapshot.room.receipts.filter((r) => r.actor === f.buyer.view.me.id).length,
    30,
  );
  const replay = await new AuctionService(db).command(
    f.teacher.code,
    f.buyer.token,
    requests[0],
  );
  assert.equal(
    replay.version,
    (await f.service.view(f.teacher.code, f.buyer.token)).version,
  );
  const after = await f.service.export(f.teacher.code, f.teacher.token);
  assert.deepEqual(after.events, snapshot.events);
  assert.deepEqual(after.room.receipts, snapshot.room.receipts);
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM auction_market_receipts WHERE room_code=$1",
        [f.teacher.code],
      )
    ).rows[0].count,
    30,
  );
});

test("schema checks and new commands retain old embedded receipts without backfilling or rewriting them", async () => {
  const f = await fixture();
  const request = await f.makeRequest(f.buyer.token, {
    type: "study-quote",
    price: 51,
  });
  await f.service.command(f.teacher.code, f.buyer.token, request);
  const legacy = [{ actor: f.buyer.view.me.id, requestId: request.requestId }];
  await db.transaction(async (tx) => {
    await tx.query("DELETE FROM auction_market_receipts WHERE room_code=$1", [
      f.teacher.code,
    ]);
    await tx.query(
      "UPDATE auction_markets SET receipts=$2::jsonb,receipt_count=0 WHERE room_code=$1",
      [f.teacher.code, JSON.stringify(legacy)],
    );
  });
  const events = (await f.service.export(f.teacher.code, f.teacher.token))
    .events;
  await migrate(db);
  await f.service.command(f.teacher.code, f.buyer.token, request);
  assert.deepEqual(
    (await f.service.export(f.teacher.code, f.teacher.token)).events,
    events,
  );
  await f.service.command(
    f.teacher.code,
    f.buyer.token,
    await f.makeRequest(f.buyer.token, { type: "study-quote", price: 52 }),
  );
  const stored = (
    await db.query<{ receipts: unknown; receipt_count: number }>(
      "SELECT receipts,receipt_count FROM auction_markets WHERE room_code=$1",
      [f.teacher.code],
    )
  ).rows[0];
  assert.deepEqual(stored.receipts, legacy);
  assert.equal(stored.receipt_count, 1);
});

test("an error after the combined write rolls back state, history, receipt and trade audit together", async () => {
  const f = await fixture();
  await f.service.command(
    f.teacher.code,
    f.seller.token,
    await f.makeRequest(f.seller.token, { type: "study-quote", price: 80 }),
  );
  const request = await f.makeRequest(f.buyer.token, {
    type: "study-quote",
    price: 80,
  });
  const before = await f.service.export(f.teacher.code, f.teacher.token);
  const failing: Database = {
    ...db,
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: async <T extends Record<string, unknown>>(
            sql: string,
            params?: unknown[],
          ) => {
            const value = await tx.query<T>(sql, params);
            if (sql.includes("WITH new_receipts"))
              throw new Error("injected post-write failure");
            return value;
          },
        }),
      ),
  };
  await assert.rejects(
    new AuctionService(failing).command(f.teacher.code, f.buyer.token, request),
    /injected/,
  );
  const after = await f.service.export(f.teacher.code, f.teacher.token);
  assert.deepEqual(after.room, before.room);
  assert.deepEqual(after.events, before.events);
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM auction_market_receipts WHERE room_code=$1 AND request_id=$2",
        [f.teacher.code, request.requestId],
      )
    ).rows[0].count,
    0,
  );
  await f.service.command(f.teacher.code, f.buyer.token, request);
  assert.equal(
    (await f.service.view(f.teacher.code, f.buyer.token)).study!.myTrades
      .length,
    1,
  );
});

test("market operation limits count appended receipts while already committed requests can still retry", async () => {
  const f = await fixture();
  const request = await f.makeRequest(f.buyer.token, {
    type: "study-quote",
    price: 50,
  });
  await f.service.command(f.teacher.code, f.buyer.token, request);
  await db.query(
    "UPDATE auction_markets SET receipt_count=50001 WHERE room_code=$1",
    [f.teacher.code],
  );
  await f.service.command(f.teacher.code, f.buyer.token, request);
  await assert.rejects(
    f.service.command(
      f.teacher.code,
      f.buyer.token,
      await f.makeRequest(f.buyer.token, { type: "study-quote", price: 51 }),
    ),
    /操作数の上限/,
  );
});

test(
  "local PostgreSQL: simultaneous retries on separate app connections commit one fill and one receipt",
  { skip: !process.env.LOCAL_TEST_DATABASE_URL },
  async () => {
    const database = postgresDatabase(process.env.LOCAL_TEST_DATABASE_URL!);
    const other = postgresDatabase(process.env.LOCAL_TEST_DATABASE_URL!);
    try {
      await migrate(database);
      const f = await fixture(database);
      await f.service.command(
        f.teacher.code,
        f.seller.token,
        await f.makeRequest(f.seller.token, { type: "study-quote", price: 80 }),
      );
      const request = await f.makeRequest(f.buyer.token, {
        type: "study-quote",
        price: 80,
      });
      const values = await Promise.all([
        f.service.command(f.teacher.code, f.buyer.token, request),
        new AuctionService(other).command(
          f.teacher.code,
          f.buyer.token,
          request,
        ),
      ]);
      assert.ok(values.every((v) => v.study!.myTrades.length === 1));
      const saved = await f.service.export(f.teacher.code, f.teacher.token);
      assert.equal(saved.events.filter((e) => e.type === "trade").length, 1);
      assert.equal(
        (
          await database.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM auction_market_receipts WHERE room_code=$1 AND request_id=$2",
            [f.teacher.code, request.requestId],
          )
        ).rows[0].count,
        1,
      );
    } finally {
      await database.close();
      await other.close();
    }
  },
);
