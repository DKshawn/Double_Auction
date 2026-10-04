// Deliberately restricted to loopback apps. Never point a load test at a cloud deployment.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { applyPatch, type RoomPatch } from "../src/lib/room-sync";
import type { Command, RoomView } from "../src/lib/types";

const bases = (
  process.env.LOCAL_LOAD_URLS ?? "http://127.0.0.1:3200,http://127.0.0.1:3201"
).split(",");
for (const base of bases) {
  const u = new URL(base);
  assert.ok(
    u.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname),
    "Local load test refuses non-loopback targets",
  );
}
const seconds = Number(process.env.LOCAL_LOAD_SECONDS ?? 330);
assert.ok(Number.isInteger(seconds) && seconds >= 5 && seconds <= 7200);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn: () => boolean, ms = 15_000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end)
      throw new Error("Local client synchronization timed out");
    await delay(20);
  }
}
type Client = {
  cookie: string;
  base: string;
  streamBase: string;
  view?: RoomView;
  wire?: RoomView;
  abort: AbortController;
  updates: number;
  reconnects: number;
  busy?: Promise<void>;
};
const stats = {
  commands: 0,
  rejected: 0,
  errors: [] as string[],
  snapshots: 0,
  patches: 0,
  heartbeats: 0,
  streamBytes: 0,
  equivalentSnapshotBytes: 0,
  patchBytes: 0,
  responseMs: [] as number[],
  fanoutMs: [] as number[],
};
let running = true;
const clients: Client[] = [];
async function api(
  base: string,
  path: string,
  data?: unknown,
  cookie?: string,
) {
  const response = await fetch(base + path, {
    method: data ? "POST" : "GET",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json();
  return { response, body };
}
function cookieOf(response: Response) {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
}
async function consume(client: Client, code: string) {
  while (running && !client.abort.signal.aborted) {
    try {
      const response = await fetch(
        `${client.streamBase}/api/rooms/${code}/events`,
        { headers: { Cookie: client.cookie }, signal: client.abort.signal },
      );
      assert.equal(response.status, 200);
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      client.wire = undefined;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        stats.streamBytes += part.value.byteLength;
        buffer += decoder.decode(part.value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const kind = frame.match(/^event: (.+)$/m)?.[1],
            raw = frame.match(/^data: (.+)$/m)?.[1];
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (kind === "snapshot") {
            client.wire = data;
            stats.snapshots++;
          } else if (kind === "patch") {
            assert.ok(client.wire);
            client.wire = applyPatch(client.wire, data as RoomPatch);
            stats.patches++;
            stats.patchBytes += Buffer.byteLength(raw);
            stats.equivalentSnapshotBytes += Buffer.byteLength(
              JSON.stringify(client.wire),
            );
          } else if (kind === "heartbeat") {
            stats.heartbeats++;
            continue;
          } else if (kind === "session-error") {
            stats.errors.push(`SSE ${data.status}: ${data.message}`);
            continue;
          }
          if (
            client.wire &&
            (!client.view || client.wire.version >= client.view.version)
          ) {
            client.view = client.wire;
            client.updates++;
          }
        }
      }
      if (running) {
        client.reconnects++;
        await delay(50);
      }
    } catch (error) {
      if (!client.abort.signal.aborted) {
        stats.errors.push(String(error));
        await delay(500);
      }
    }
  }
}
function choice(view: RoomView, tick: number): Command | undefined {
  const s = view.study!,
    m = s.market;
  if (view.phase !== "running" || s.unitsUsed >= 2) return;
  if (m.stage === "cda") {
    // Repricing builds substantial public history; occasional crosses exercise fills.
    const buyer = view.me.role === "buyer",
      cross = tick % 25 === 24;
    return {
      type: "study-quote",
      price: cross
        ? buyer
          ? 110
          : 50
        : buyer
          ? 50 + (tick % 7)
          : 110 - (tick % 7),
    };
  }
  if (m.stage === "call" && !m.submitted)
    return { type: "call-submit", prices: s.unitLimits!.slice(s.unitsUsed) };
  if (m.stage === "offer" && view.me.role === "seller" && !m.myOffer)
    return { type: "posted-offer", price: 80, quantity: 2 };
  if (
    m.stage === "purchase" &&
    view.me.role === "buyer" &&
    m.activeBuyer === view.me.alias
  ) {
    const offer = m.offers.find((o) => o.remaining > 0);
    return offer
      ? {
          type: "posted-buy",
          offerId: offer.id,
          quantity: Math.min(2 - s.unitsUsed, offer.remaining),
        }
      : { type: "posted-pass" };
  }
}
function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? Math.round(
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 10,
      ) / 10
    : null;
}
async function main() {
  const setup = performance.now();
  const created = await api(bases[0], "/api/rooms", {
    config: {
      title: "192人・ローカル負荷試験",
      protocol: "institutions-v1",
      markets: 12,
      capacity: 192,
      rounds: 15,
      duration: 180,
    },
    password: "Local-Load-2026",
    accessKey: "",
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.body));
  const code = created.body.code as string,
    teacherCookie = cookieOf(created.response);
  for (let batch = 0; batch < 192; batch += 16) {
    await Promise.all(
      Array.from({ length: 16 }, async (_, j) => {
        const i = batch + j,
          base = bases[i % bases.length];
        const joined = await api(base, `/api/rooms/${code}/join`, {
          nickname: `負荷${String(i + 1).padStart(3, "0")}`,
          pin: "123456",
        });
        assert.equal(joined.response.status, 200, JSON.stringify(joined.body));
        clients[i] = {
          cookie: cookieOf(joined.response),
          base,
          streamBase: bases[(i + 1) % bases.length],
          abort: new AbortController(),
          updates: 0,
          reconnects: 0,
        };
      }),
    );
  }
  const teacher: Client = {
    cookie: teacherCookie,
    base: bases[0],
    streamBase: bases.at(-1)!,
    abort: new AbortController(),
    updates: 0,
    reconnects: 0,
  };
  clients.push(teacher);
  const streams = clients.map((c) => consume(c, code));
  await until(() => clients.every((c) => !!c.view), 60_000);
  async function command(client: Client, action: Command, measure = true) {
    const before = client.view!,
      started = performance.now();
    const result = await api(
      client.base,
      `/api/rooms/${code}/commands`,
      {
        requestId: crypto.randomUUID(),
        expectedRound: before.round,
        expectedStage: before.study!.market.stageKey,
        command: action,
      },
      client.cookie,
    );
    if (measure) {
      stats.commands++;
      stats.responseMs.push(performance.now() - started);
    }
    if (result.response.status === 409) {
      stats.rejected++;
      return;
    }
    if (!result.response.ok) {
      stats.errors.push(`HTTP ${result.response.status}: ${result.body.error}`);
      return;
    }
    if (!client.view || client.view.version <= result.body.version)
      client.view = result.body;
    if (measure && before.me.role !== "teacher") {
      const peers = clients
        .slice(0, 192)
        .filter((p) => p.view!.study!.market.id === before.study!.market.id);
      await until(() =>
        peers.every((p) => p.wire && p.wire.version >= result.body.version),
      );
      stats.fanoutMs.push(performance.now() - started);
    }
  }
  await command(teacher, { type: "start" }, false);
  await until(() => clients.every((c) => c.view!.phase === "running"));
  const start = performance.now();
  console.log(
    JSON.stringify({
      stage: "running",
      code,
      clients: 193,
      markets: 12,
      processes: bases.length,
      setupSeconds: Math.round((start - setup) / 1000),
      durationSeconds: seconds,
    }),
  );
  let tick = 0;
  while (performance.now() - start < seconds * 1000) {
    for (const client of clients.slice(0, 192)) {
      if (client.busy) continue;
      const action = choice(client.view!, tick);
      if (action)
        client.busy = command(client, action)
          .catch((e) => {
            stats.errors.push(String(e));
          })
          .finally(() => {
            client.busy = undefined;
          });
    }
    tick++;
    await delay(2000);
  }
  await Promise.all(clients.map((c) => c.busy));
  if (teacher.view!.phase === "running")
    await command(teacher, { type: "pause" }, false);
  await until(() =>
    clients.every((c) => ["paused", "finished"].includes(c.wire!.phase)),
  );
  for (const client of clients) {
    const { response, body } = await api(
      client.base,
      `/api/rooms/${code}`,
      undefined,
      client.cookie,
    );
    assert.equal(response.status, 200);
    const normalize = (v: RoomView) => {
      const copy = structuredClone(v);
      copy.serverTime = 0;
      return copy;
    };
    assert.deepEqual(normalize(client.wire!), normalize(body));
    if (client.view!.me.role !== "teacher") {
      assert.equal(body.study.teacher, undefined);
      assert.ok(
        body.study.market.trades.every(
          (t: { market: number; institution: string }) =>
            t.market === body.study.market.id &&
            t.institution === body.study.market.institution,
        ),
      );
      assert.ok(!JSON.stringify(body).includes('"tokenHash"'));
    }
  }
  const report = {
    at: new Date().toISOString(),
    appTargets: bases,
    database: "local PostgreSQL on 127.0.0.1:55433",
    code,
    elapsedSeconds: Math.round((performance.now() - start) / 1000),
    students: 192,
    teachers: 1,
    markets: 12,
    commands: stats.commands,
    expectedConflictRejections: stats.rejected,
    errors: stats.errors,
    responseMs: {
      p50: percentile(stats.responseMs, 0.5),
      p95: percentile(stats.responseMs, 0.95),
      p99: percentile(stats.responseMs, 0.99),
      max: percentile(stats.responseMs, 1),
    },
    fanoutToAll16Ms: {
      p50: percentile(stats.fanoutMs, 0.5),
      p95: percentile(stats.fanoutMs, 0.95),
      p99: percentile(stats.fanoutMs, 0.99),
      max: percentile(stats.fanoutMs, 1),
    },
    snapshots: stats.snapshots,
    patches: stats.patches,
    heartbeats: stats.heartbeats,
    reconnects: clients.reduce((n, c) => n + c.reconnects, 0),
    streamBytes: stats.streamBytes,
    patchBytes: stats.patchBytes,
    equivalentSnapshotBytes: stats.equivalentSnapshotBytes,
    patchReductionPercent:
      Math.round(
        1000 * (1 - stats.patchBytes / stats.equivalentSnapshotBytes),
      ) / 10,
    finalSnapshotsMatch: true,
    currentPeriods: teacher.wire!.study!.teacher!.markets.map((m) => ({
      market: m.id,
      period: m.round,
      institution: m.institution,
      trades: m.trades.length,
      ordersInHistory: m.orderHistory.length,
    })),
  };
  await mkdir("work", { recursive: true });
  await writeFile(
    "work/local-load-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  running = false;
  for (const c of clients) c.abort.abort();
  await Promise.all(streams);
  assert.equal(stats.errors.length, 0, "Local load test encountered failures");
}
main().catch((error) => {
  running = false;
  for (const c of clients) c.abort.abort();
  console.error(error);
  process.exitCode = 1;
});
