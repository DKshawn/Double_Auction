import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { postgresDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { RealtimeBroker, type StreamEvent } from "../src/lib/server/realtime";
import { applyPatch, type RoomPatch } from "../src/lib/room-sync";
import type { RoomView, Command } from "../src/lib/types";
import type { Room } from "../src/lib/auction-model";

const url = process.env.LOCAL_TEST_DATABASE_URL;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn: () => boolean, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end)
      throw new Error("Timed out waiting for local synchronization");
    await delay(10);
  }
}

test(
  "local PostgreSQL: independent market locks, atomic fills, cross-connection push, privacy, retries and deadlines",
  { skip: !url },
  async () => {
    const db = postgresDatabase(url!),
      db2 = postgresDatabase(url!);
    const broker = new RealtimeBroker(db2);
    const stops: (() => void)[] = [];
    try {
      await migrate(db);
      const svc = new AuctionService(db);
      const teacher = await svc.create(
        {
          title: "ローカル並行検証",
          protocol: "institutions-v1",
          markets: 6,
          capacity: 96,
          rounds: 15,
          duration: 180,
        },
        "Local-Test-2026",
        "",
      );
      const students = await Promise.all(
        Array.from({ length: 96 }, (_, i) =>
          svc.join(teacher.code, `local-${i}`, "123456"),
        ),
      );
      let roster = await Promise.all(
        students.map(async (s) => ({
          ...s,
          view: await svc.view(s.code, s.token),
        })),
      );
      await db.query(
        'UPDATE auction_markets SET state = jsonb_set(state, \'{order}\', \'["cda","call","posted"]\'::jsonb) WHERE room_code = $1',
        [teacher.code],
      );
      const send = async (token: string, command: Command) => {
        const view = await svc.view(teacher.code, token);
        return svc.command(teacher.code, token, {
          requestId: randomUUID(),
          expectedRound: view.round,
          expectedStage: view.study!.market.stageKey,
          command,
        });
      };
      await send(teacher.token, {
        type: "study-randomize",
        expectedRevision: 0,
      });
      const countdown = await send(teacher.token, { type: "start" });
      await delay(
        Math.max(0, countdown.study!.market.deadline! - countdown.serverTime) +
          20,
      );
      roster = await Promise.all(
        students.map(async (s) => ({
          ...s,
          view: await svc.view(s.code, s.token),
        })),
      );
      const group = (id: number) =>
        roster.filter((s) => s.view.study!.market.id === id);
      const seller = group(1).find((s) => s.view.me.role === "seller")!;
      const buyers = group(1).filter((s) => s.view.me.role === "buyer");
      const other = group(2)[0];
      let release!: () => void;
      let locked!: () => void;
      const acquired = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const hold = db.transaction(async (tx) => {
        await tx.query(
          "SELECT market_id FROM auction_markets WHERE room_code = $1 AND market_id = 1 FOR UPDATE",
          [teacher.code],
        );
        locked();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      await acquired;
      try {
        // This must finish while market 1 is still locked, not after releasing it.
        await Promise.race([
          send(other.token, { type: "study-quote", price: 70 }),
          delay(2000).then(() => {
            throw new Error("Another market blocked the order");
          }),
        ]);
      } finally {
        release();
        await hold;
      }
      const rootBefore = (
        await db.query<{ state: Room }>(
          "SELECT state FROM auction_rooms WHERE code = $1",
          [teacher.code],
        )
      ).rows[0].state;
      let streamed: RoomView | undefined, teacherView: RoomView | undefined;
      let patches = 0;
      const receive = (target: "buyer" | "teacher") => (event: StreamEvent) => {
        if (event.type === "session-error")
          throw new Error(JSON.stringify(event.data));
        if (event.type !== "snapshot" && event.type !== "patch") return;
        const current = target === "buyer" ? streamed : teacherView;
        const next =
          event.type === "snapshot"
            ? (event.data as RoomView)
            : applyPatch(current!, event.data as RoomPatch);
        if (event.type === "patch") patches++;
        if (target === "buyer") streamed = next;
        else teacherView = next;
      };
      stops.push(
        await broker.subscribe(teacher.code, buyers[0].token, receive("buyer")),
      );
      stops.push(
        await broker.subscribe(teacher.code, teacher.token, receive("teacher")),
      );
      const offered = await send(seller.token, {
        type: "study-quote",
        price: 80,
      });
      const orderId = offered.study!.market.orders[0].id;
      await until(() =>
        streamed!.study!.market.orders.some((o) => o.id === orderId),
      );
      const results = await Promise.allSettled(
        buyers
          .slice(0, 2)
          .map((b) => send(b.token, { type: "study-accept", orderId })),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      await until(
        () =>
          streamed!.study!.market.trades.length === 1 &&
          teacherView!.study!.teacher!.markets[0].trades.length === 1,
      );
      assert.ok(patches > 0);
      const rootAfter = (
        await db.query<{ state: Room }>(
          "SELECT state FROM auction_rooms WHERE code = $1",
          [teacher.code],
        )
      ).rows[0].state;
      assert.deepEqual(
        rootAfter,
        rootBefore,
        "student transactions must not rewrite the room record",
      );
      assert.equal(streamed!.study!.teacher, undefined);
      assert.ok(!JSON.stringify(streamed).includes("tokenHash"));
      assert.ok(
        streamed!.study!.market.trades.every(
          (t) => !("value" in t) && !("cost" in t),
        ),
      );
      const paused = await send(teacher.token, { type: "pause" });
      await until(() => streamed!.phase === "paused");
      assert.ok(
        paused.study!.teacher!.markets.every((m) => m.deadline === null),
      );
      await assert.rejects(
        send(seller.token, { type: "study-quote", price: 81 }),
        /取引時間外/,
      );
      await send(teacher.token, { type: "resume" });
      await until(() => streamed!.phase === "running");

      // Switch via teacher controls, never changing the rule durations themselves.
      for (let i = 0; i < 5; i++)
        await send(teacher.token, { type: "end-round" });
      await until(() => streamed!.study!.market.stage === "call");
      assert.equal(
        streamed!.study!.market.trades.length,
        0,
        "student payload is now limited to the Call block",
      );
      const current = await svc.view(teacher.code, buyers[0].token);
      const request = {
        requestId: randomUUID(),
        expectedRound: current.round,
        expectedStage: current.study!.market.stageKey,
        command: { type: "call-submit" as const, prices: [120, 100] },
      };
      await Promise.all([
        svc.command(teacher.code, buyers[0].token, request),
        svc.command(teacher.code, buyers[0].token, request),
      ]);
      await send(seller.token, { type: "call-submit", prices: [40, 60] });
      const stranger = await svc.view(teacher.code, buyers[1].token);
      assert.deepEqual(stranger.study!.market.orders, []);
      assert.deepEqual(stranger.study!.market.myOrders, []);
      await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE auction_markets SET state = jsonb_set(state, '{deadline}', to_jsonb((extract(epoch FROM clock_timestamp()) * 1000)::bigint + 250)), version = version + 1 WHERE room_code = $1 AND market_id = 1",
          [teacher.code],
        );
        await tx.query("SELECT pg_notify('auction_changes', $1)", [
          JSON.stringify({ code: teacher.code, market: 1 }),
        ]);
      });
      await until(() => streamed!.study!.market.call === 2);
      assert.equal(streamed!.study!.market.trades.length, 2);
      assert.equal(teacherView!.study!.teacher!.markets[0].trades.length, 3);
      const exported = await svc.export(teacher.code, teacher.token);
      assert.equal(
        exported.events.filter((e) => e.type === "call-order").length,
        4,
        "retries never duplicate orders",
      );
      assert.equal(exported.events.filter((e) => e.type === "trade").length, 3);
      assert.equal(
        new Set(exported.events.map((e) => `${e.scope ?? 0}:${e.sequence}`))
          .size,
        exported.events.length,
      );

      // A fresh connection repairs missed changes with an authorized snapshot.
      stops[0]();
      await send(teacher.token, { type: "pause" });
      streamed = undefined;
      stops.push(
        await broker.subscribe(teacher.code, buyers[0].token, receive("buyer")),
      );
      assert.equal(streamed!.phase, "paused");
      assert.equal(streamed!.study!.market.trades.length, 2);
      for (const stop of stops.splice(0)) stop();
      await delay(1200);
      streamed = undefined;
      stops.push(
        await broker.subscribe(teacher.code, buyers[0].token, receive("buyer")),
      );
      assert.equal(streamed!.phase, "paused");
      await send(teacher.token, { type: "resume" });
      await until(() => streamed!.phase === "running");
    } finally {
      for (const stop of stops) stop();
      await broker.close();
      await db.close();
      await db2.close();
    }
  },
);
