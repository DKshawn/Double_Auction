import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  localDatabase,
  migrate,
  type Database,
  type Sql,
} from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { lockBundle, saveBundle } from "../src/lib/server/market-store";
import {
  actionBatchSchema,
  readActionLogs,
} from "../src/lib/server/action-log";
import {
  actionExport,
  eventOperations,
  type ClientAction,
  type Interaction,
  type Operation,
} from "../src/lib/action-log";
import { commandSchema } from "../src/lib/server/http";
import type { Command, CommandRequest, RoomView } from "../src/lib/types";

let pg: PGlite, db: Database, service: AuctionService;
const queries: { sql: string; inTransaction: boolean }[] = [];
let inTransaction = false;
before(async () => {
  pg = new PGlite();
  const base = localDatabase(pg);
  const track = (sql: Sql): Sql => ({
    query: (...args) => {
      queries.push({ sql: args[0], inTransaction });
      return sql.query(...args);
    },
  });
  db = {
    mode: "local",
    query: track(base).query,
    transaction: (fn) =>
      base.transaction(async (tx) => {
        inTransaction = true;
        try {
          return await fn(track(tx));
        } finally {
          inTransaction = false;
        }
      }),
  };
  await migrate(db);
  service = new AuctionService(db);
});
after(async () => {
  await pg.close();
});

function interaction(button = "quote.submit"): Interaction {
  return {
    id: randomUUID(),
    button,
    clickedAt: Date.now(),
    clockOffsetMs: 125,
    tabId: randomUUID(),
    elapsedMs: 500,
  };
}
async function classroom() {
  const teacher = await service.create(
    {
      title: "操作監査テスト",
      protocol: "institutions-v1",
      markets: 1,
      marketSize: 2,
      capacity: 2,
      rounds: 15,
      duration: 300,
    },
    "Audit-test-only",
    "",
  );
  const initial = await service.export(teacher.code, teacher.token);
  delete initial.room.study!.lobby;
  initial.room.study!.markets[0].order = ["cda", "call", "posted"];
  await db.transaction(async (tx) =>
    saveBundle(tx, await lockBundle(tx, teacher.code), initial.room, []),
  );
  const students: { token: string; view: RoomView }[] = [];
  for (let i = 0; i < 2; i++) {
    const login = await service.join(teacher.code, `監査学生${i}`, "123456");
    students.push({
      token: login.token,
      view: await service.view(teacher.code, login.token),
    });
  }
  await service.command(teacher.code, teacher.token, {
    requestId: randomUUID(),
    expectedRound: 0,
    command: { type: "start" },
  });
  const buyer = students.find((student) => student.view.me.role === "buyer")!;
  const seller = students.find((student) => student.view.me.role === "seller")!;
  const request = async (
    token: string,
    command: Command,
    click = interaction(),
  ): Promise<CommandRequest> => {
    const view = await service.view(teacher.code, token);
    return {
      requestId: randomUUID(),
      interaction: click,
      expectedRound: view.round,
      expectedStage: view.study!.market.stageKey,
      command,
    };
  };
  return { teacher, buyer, seller, request };
}
async function snapshot(code: string) {
  return (
    await db.query<{ snapshot: unknown }>(
      `SELECT jsonb_build_object(
    'room', (SELECT state FROM auction_rooms WHERE code=$1),
    'markets', (SELECT jsonb_agg(to_jsonb(m) ORDER BY market_id) FROM auction_markets m WHERE room_code=$1),
    'events', (SELECT jsonb_agg(event ORDER BY sequence) FROM auction_events WHERE room_code=$1),
    'marketEvents', (SELECT jsonb_agg(event ORDER BY sequence) FROM auction_market_events WHERE room_code=$1)
  ) AS snapshot`,
      [code],
    )
  ).rows[0].snapshot;
}

test("success audits distinguish limit submission and best acceptance, correlate fills, and add no SQL calls", async () => {
  const { teacher, buyer, seller, request } = await classroom();
  const quoted = await request(seller.token, {
    type: "study-quote",
    price: 80,
  });
  queries.length = 0;
  const posted = await service.command(teacher.code, seller.token, quoted);
  assert.ok(queries.length <= 7); // History, state, receipt and audit share one write.
  assert.ok(
    queries.every((q) => !q.sql.includes("INSERT INTO auction_action_logs")),
  );
  const quote = await service.operationOutcome(
    teacher.code,
    seller.token,
    quoted.requestId,
  );
  assert.equal(quote?.commandType, "study-quote");
  assert.equal(quote?.result?.code, "quote_accepted");
  assert.equal(quote?.status, "success");
  assert.equal(quote?.reason, undefined);
  assert.equal(quote?.errorCode, undefined);
  const id = posted.study!.market.orders[0].id;
  const accepted = await request(
    buyer.token,
    { type: "study-accept", orderId: id },
    interaction("quote.accept-best"),
  );
  await service.command(teacher.code, buyer.token, accepted);
  const result = await service.operationOutcome(
    teacher.code,
    buyer.token,
    accepted.requestId,
  );
  assert.equal(result?.commandType, "study-accept");
  assert.equal(result?.result?.code, "trade_executed");
  assert.equal(result?.result?.targetOrderId, id);
  assert.equal(result?.result?.trades?.[0].price, 80);
  assert.equal(result?.reason, undefined);
  assert.equal(result?.errorCode, undefined);
  const saved = await snapshot(teacher.code);
  await service.command(teacher.code, buyer.token, accepted);
  assert.deepEqual(
    await snapshot(teacher.code),
    saved,
    "network retries cannot create duplicate fills/events",
  );
  assert.equal(
    await service.operationOutcome(
      teacher.code,
      seller.token,
      accepted.requestId,
    ),
    null,
    "outcomes belong to the authenticated actor",
  );
  assert.equal(
    (await service.exportActions(teacher.code, teacher.token)).rowCount,
    3,
  );
});

test("crossing limit submissions remain submissions even when they execute immediately", async () => {
  const { teacher, buyer, seller, request } = await classroom();
  await service.command(
    teacher.code,
    seller.token,
    await request(seller.token, { type: "study-quote", price: 80 }),
  );
  const crossing = await request(buyer.token, {
    type: "study-quote",
    price: 90,
  });
  await service.command(teacher.code, buyer.token, crossing);
  const result = await service.operationOutcome(
    teacher.code,
    buyer.token,
    crossing.requestId,
  );
  assert.equal(result?.commandType, "study-quote");
  assert.equal(result?.result?.code, "trade_executed");
  assert.equal(result?.result?.targetOrderId, undefined);
});

test("rejected best-order and stage requests retain reasons outside the market transaction without altering experiment data", async () => {
  const { teacher, buyer, request } = await classroom();
  const rejected = await request(buyer.token, {
    type: "study-accept",
    orderId: randomUUID(),
  });
  const before = await snapshot(teacher.code);
  queries.length = 0;
  await assert.rejects(
    service.command(teacher.code, buyer.token, rejected),
    /最良注文/,
  );
  const insertion = queries.find((q) =>
    q.sql.includes("INSERT INTO auction_action_logs"),
  );
  assert.ok(insertion);
  assert.equal(insertion.inTransaction, false);
  assert.deepEqual(await snapshot(teacher.code), before);
  const result = await service.operationOutcome(
    teacher.code,
    buyer.token,
    rejected.requestId,
  );
  assert.equal(result?.status, "rejected");
  assert.equal(result?.errorCode, "BEST_ORDER_CHANGED");
  assert.match(result!.reason!, /最良注文/);
  assert.equal(result?.result, undefined);
  const changed = {
    ...rejected,
    requestId: randomUUID(),
    expectedStage: "old-stage",
  };
  await assert.rejects(
    service.command(teacher.code, buyer.token, changed),
    /段階/,
  );
  assert.equal(
    (
      await service.operationOutcome(
        teacher.code,
        buyer.token,
        changed.requestId,
      )
    )?.errorCode,
    "STAGE_CHANGED",
  );
});

test("batch uploads deduplicate by ID, cannot forge server identity, and exports/ingestion never settle deadlines", async () => {
  const { teacher, buyer, seller } = await classroom();
  const event: ClientAction = {
    id: randomUUID(),
    interaction: interaction(),
    sequence: 1,
    label: "指値注文",
    method: "pointer",
    round: 1,
    market: 1,
    stage: "cda",
    version: 0,
    phase: "result",
    status: "blocked",
    errorCode: "INVALID_PRICE",
    reason: "価格が空です。",
  };
  assert.equal(
    actionBatchSchema.safeParse({
      participantId: buyer.view.me.id,
      entries: [event],
    }).success,
    true,
  );
  assert.equal(
    actionBatchSchema.safeParse({
      participantId: buyer.view.me.id,
      entries: [{ ...event, actor: seller.view.me.id }],
    }).success,
    false,
  );
  assert.equal(
    actionBatchSchema.safeParse({
      participantId: buyer.view.me.id,
      entries: [{ ...event, status: "local_success" }],
    }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({
      requestId: randomUUID(),
      expectedRound: 1,
      command: { type: "study-quote", price: 80 },
      interaction: interaction(),
    }).success,
    true,
  );
  const before = await snapshot(teacher.code);
  queries.length = 0;
  await service.recordActions(teacher.code, buyer.token, [event]);
  await service.recordActions(teacher.code, buyer.token, [event]);
  const exported = await service.exportActions(teacher.code, teacher.token);
  assert.ok(
    queries.every((q) => !/FOR UPDATE|UPDATE auction_|pg_notify/.test(q.sql)),
  );
  const logs = (await readActionLogs(db, teacher.code)).filter(
    (entry) => entry.source === "client",
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0].actor, buyer.view.me.id);
  assert.match(exported.content, /INVALID_PRICE/);
  assert.match(exported.content, /価格が空/);
  assert.deepEqual(await snapshot(teacher.code), before);
  await assert.rejects(
    service.recordActions(teacher.code, "expired-token", [event]),
  );
  await assert.rejects(service.exportActions(teacher.code, buyer.token));
  await assert.rejects(
    service.recordActions(
      teacher.code,
      buyer.token,
      [event],
      seller.view.me.id,
    ),
    /入室情報/,
  );
});

test("a response failure after commit stays successful and overrides a client timeout in CSV", async () => {
  const { teacher, buyer, request } = await classroom();
  const req = await request(buyer.token, { type: "study-quote", price: 50 });
  const originalView = service.view;
  service.view = async () => {
    throw new Error("response projection unavailable");
  };
  try {
    await assert.rejects(
      service.command(teacher.code, buyer.token, req),
      /projection/,
    );
  } finally {
    service.view = originalView;
  }
  assert.equal(
    (await service.operationOutcome(teacher.code, buyer.token, req.requestId))
      ?.status,
    "success",
  );
  const timeout: ClientAction = {
    id: randomUUID(),
    interaction: req.interaction!,
    sequence: 2,
    label: "指値注文",
    method: "pointer",
    round: 1,
    version: 0,
    phase: "result",
    commandType: "study-quote",
    requestId: req.requestId,
    status: "unconfirmed",
    errorCode: "NETWORK_UNCONFIRMED",
    reason: "応答なし",
  };
  await service.recordActions(teacher.code, buyer.token, [timeout]);
  const csv = (await service.exportActions(teacher.code, teacher.token))
    .content;
  assert.match(csv, /quote_accepted/);
  assert.doesNotMatch(csv, /NETWORK_UNCONFIRMED|応答なし/);
});

test("historical quote events are left unclassified and extreme client clocks cannot break export", () => {
  const historical = {
    sequence: 1,
    at: 1000,
    round: 1,
    type: "quote",
    actor: "student",
    detail: { price: 80 },
  };
  assert.equal(actionExport(eventOperations([historical])).rowCount, 0);
  assert.deepEqual(historical.detail, { price: 80 });
  const op: Operation = {
    requestId: randomUUID(),
    commandType: "study-quote",
    actor: "student",
    round: 1,
    receivedAt: Date.now(),
    processedAt: Date.now(),
    status: "success",
    result: { code: "quote_accepted" },
    interaction: { ...interaction(), clickedAt: 8.64e15, clockOffsetMs: 1e9 },
  };
  const csv = actionExport([
    { source: "server", actor: "student", at: Date.now(), data: op },
  ]);
  assert.equal(csv.rowCount, 1);
  assert.ok(csv.content.includes("quote_accepted"));
});
