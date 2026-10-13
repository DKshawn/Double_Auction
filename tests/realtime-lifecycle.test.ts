import { after, before, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { broker } from "../src/lib/server/realtime";
import { GET } from "../src/app/api/rooms/[code]/events/route";

const nextServer = createRequire(import.meta.url)(
  "next/server",
) as typeof import("next/server");
const pg = new PGlite();
const base = localDatabase(pg);
before(() => migrate(base));
after(() => pg.close());

const gate = () => Promise.withResolvers<void>();
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function fixture(
  t: TestContext,
  connect?: Promise<void>,
  close?: Promise<void>,
) {
  let starts = 0,
    stops = 0;
  const closing = gate();
  const db: Database = {
    ...base,
    async listen(onChange, onError) {
      starts++;
      await connect;
      const unlisten = await base.listen!(onChange, onError);
      return async () => {
        closing.resolve();
        await close;
        await unlisten();
        stops++;
      };
    },
  };
  const realtime = broker(db);
  const service = new AuctionService(db);
  const create = () =>
    service.create(
      {
        title: "通知の終了確認",
        protocol: "institutions-v1",
        markets: 1,
        capacity: 2,
        marketSize: 2,
        rounds: 5,
        duration: 180,
        studyInstitutions: ["cda"],
        studyPeriods: { cda: 5 },
      },
      "Local-Test-2026",
      "",
    );
  const teacher = await create();
  t.after(() => realtime.close());
  return {
    db,
    realtime,
    service,
    teacher,
    create,
    closing,
    starts: () => starts,
    stops: () => stops,
  };
}

async function routeFixture(
  t: TestContext,
  connect?: Promise<void>,
  close?: Promise<void>,
) {
  const f = await fixture(t, connect, close);
  const globals = globalThis as typeof globalThis & {
    auctionDatabase?: Promise<Database>;
  };
  const previous = globals.auctionDatabase;
  globals.auctionDatabase = Promise.resolve(f.db);
  t.after(() => {
    globals.auctionDatabase = previous;
  });
  const afterResponse: (() => unknown)[] = [];
  t.mock.method(nextServer, "after", (fn: () => unknown) => {
    afterResponse.push(fn);
  });
  const controller = new AbortController();
  const request = new NextRequest(
    `http://localhost/api/rooms/${f.teacher.code}/events`,
    {
      signal: controller.signal,
      headers: { cookie: `auction_${f.teacher.code}=${f.teacher.token}` },
    },
  );
  const response = await GET(request, {
    params: Promise.resolve({ code: f.teacher.code }),
  });
  assert.equal(response.status, 200);
  assert.equal(
    afterResponse.length,
    1,
    "cleanup must be registered before returning the response",
  );
  const finishResponse = () => Promise.all(afterResponse.map((fn) => fn()));
  t.after(async () => {
    controller.abort();
    await finishResponse();
  });
  return { ...f, controller, response, finishResponse };
}

test("last unsubscribe awaits actual listener shutdown and is idempotent", async (t) => {
  const close = gate();
  t.after(() => close.resolve());
  const f = await fixture(t, undefined, close.promise);
  const stop = await f.realtime.subscribe(
    f.teacher.code,
    f.teacher.token,
    () => {},
  );
  let finished = false;
  const cleanup = stop();
  assert.equal(stop(), cleanup);
  void cleanup.then(() => {
    finished = true;
  });
  await f.closing.promise;
  assert.equal(f.stops(), 0);
  assert.equal(
    finished,
    false,
    "request cannot finish while the database is still closing",
  );
  close.resolve();
  await cleanup;
  assert.equal(f.stops(), 1);
  await stop();
  assert.equal(f.stops(), 1);
});

test("closing one stream preserves the shared listener for other rooms and subscribers", async (t) => {
  const f = await fixture(t);
  const other = await f.create();
  const stop1 = await f.realtime.subscribe(
    f.teacher.code,
    f.teacher.token,
    () => {},
  );
  let messages = 0;
  const stop2 = await f.realtime.subscribe(
    f.teacher.code,
    f.teacher.token,
    () => {
      messages++;
    },
  );
  const stop3 = await f.realtime.subscribe(other.code, other.token, () => {});
  await stop1();
  assert.equal(f.stops(), 0);
  const before = messages;
  await f.service.join(f.teacher.code, "通知確認", "123456");
  const end = Date.now() + 2000;
  while (messages === before && Date.now() < end)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(
    messages > before,
    "remaining subscriber must still receive changes",
  );
  await stop2();
  assert.equal(f.stops(), 0);
  await stop3();
  assert.equal(f.starts(), 1);
  assert.equal(f.stops(), 1);
});

test("a replacement subscription is reserved before the old stream leaves", async (t) => {
  const f = await fixture(t);
  const old = await f.realtime.subscribe(
    f.teacher.code,
    f.teacher.token,
    () => {},
  );
  let snapshot = false;
  const replacement = f.realtime.subscribe(
    f.teacher.code,
    f.teacher.token,
    (event) => {
      if (event.type === "snapshot") snapshot = true;
    },
  );
  await old();
  const stop = await replacement;
  assert.equal(snapshot, true);
  assert.equal(f.starts(), 1);
  assert.equal(f.stops(), 0, "handoff must not close the live shared listener");
  await stop();
  assert.equal(f.stops(), 1);
});

test("a reconnect arriving during shutdown waits for the old listener to close", async (t) => {
  const close = gate();
  t.after(() => close.resolve());
  const f = await fixture(t, undefined, close.promise);
  const first = await f.realtime.subscribe(
    f.teacher.code,
    f.teacher.token,
    () => {},
  );
  const cleanup = first();
  await f.closing.promise;
  const replacement = f.realtime.subscribe(
    f.teacher.code,
    f.teacher.token,
    () => {},
  );
  await flush();
  assert.equal(f.starts(), 1);
  close.resolve();
  await cleanup;
  const stop = await replacement;
  assert.equal(f.starts(), 2);
  assert.equal(f.stops(), 1);
  await stop();
  assert.equal(f.stops(), 2);
});

test("SSE request abort waits for cleanup in the platform after-response hook", async (t) => {
  const close = gate();
  t.after(() => close.resolve());
  const f = await routeFixture(t, undefined, close.promise);
  const reader = f.response.body!.getReader();
  await reader.read();
  f.controller.abort();
  let finished = false;
  const cleanup = f.finishResponse().then(() => {
    finished = true;
  });
  await f.closing.promise;
  assert.equal(finished, false);
  close.resolve();
  await cleanup;
  assert.equal(f.stops(), 1);
});

test("SSE cancellation during listener connection still releases the late subscription", async (t) => {
  const connect = gate();
  t.after(() => connect.resolve());
  const f = await routeFixture(t, connect.promise);
  f.controller.abort();
  const cleanup = f.finishResponse();
  connect.resolve();
  await cleanup;
  assert.equal(f.starts(), 1);
  assert.equal(f.stops(), 1);
});

test("cancelling the SSE reader releases the listener even without a request abort", async (t) => {
  const f = await routeFixture(t);
  const reader = f.response.body!.getReader();
  await reader.read();
  await reader.cancel();
  await f.finishResponse();
  assert.equal(f.controller.signal.aborted, false);
  assert.equal(f.stops(), 1);
});

test("platform response completion alone also releases the SSE listener", async (t) => {
  const f = await routeFixture(t);
  await f.response.body!.getReader().read();
  await f.finishResponse();
  assert.equal(f.stops(), 1);
});
