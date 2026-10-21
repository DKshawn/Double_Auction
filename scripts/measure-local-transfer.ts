// In-memory PostgreSQL only: this script never opens a Neon/production connection.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  localDatabase,
  migrate,
  type Database,
  type Sql,
} from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { lockBundle, saveBundle } from "../src/lib/server/market-store";
import { RealtimeBroker } from "../src/lib/server/realtime";
import type { Command, RoomView } from "../src/lib/types";

async function main() {
  const pg = new PGlite();
  const base = localDatabase(pg);
  let bytes = 0,
    queries = 0;
  const meter = (sql: Sql): Sql => ({
    async query<T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) {
      const result = await sql.query<T>(text, params);
      bytes += Buffer.byteLength(JSON.stringify(result.rows));
      queries++;
      return result;
    },
  });
  const db: Database = {
    ...base,
    query: meter(base).query,
    transaction: (fn) => base.transaction((tx) => fn(meter(tx))),
  };
  const svc = new AuctionService(db);
  const realtime = new RealtimeBroker(db);
  const stops: (() => void)[] = [];
  const samples: Record<
    string,
    { bytes: number; queries: number; elapsedMs: number }
  > = {};
  async function sample(name: string, fn: () => Promise<void>) {
    bytes = 0;
    queries = 0;
    const start = performance.now();
    await fn();
    samples[name] = {
      bytes,
      queries,
      elapsedMs: Math.round(performance.now() - start),
    };
  }
  try {
    await migrate(db);
    const teacher = await svc.create(
      {
        title: "Local transfer measurement",
        protocol: "institutions-v1",
        markets: 12,
        marketSize: 16,
        capacity: 192,
        rounds: 1,
        duration: 3600,
        studyInstitutions: ["cda"],
        studyPeriods: { cda: 1 },
        studyTiming: {
          cdaSeconds: 3600,
          callSeconds: 60,
          offerSeconds: 60,
          buyerSeconds: 60,
        },
      },
      "Local-transfer-only",
      "",
    );
    // Use the saved pre-lobby format to make participant seats deterministic.
    await db.transaction(async (tx) => {
      const before = await lockBundle(tx, teacher.code);
      const room = structuredClone(before.root);
      room.study!.markets = before.markets.map((m) => m.state);
      delete room.study!.lobby;
      await saveBundle(tx, before, room, []);
    });
    const students: { token: string; view: RoomView }[] = [];
    for (let i = 0; i < 192; i++) {
      const login = await svc.join(teacher.code, `local${i}`, "123456");
      students.push({
        token: login.token,
        view: await svc.view(teacher.code, login.token),
      });
    }
    const send = async (token: string, command: Command) => {
      const view = await svc.view(teacher.code, token);
      return svc.command(teacher.code, token, {
        requestId: randomUUID(),
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        command,
      });
    };
    await send(teacher.token, { type: "start" });
    const buyer = students.find((s) => s.view.me.role === "buyer")!;
    for (let i = 0; i < 100; i++)
      await send(buyer.token, { type: "study-quote", price: 40 + (i % 20) });
    const exported = await svc.export(teacher.code, teacher.token);
    assert.equal(exported.room.study!.markets[0].orderHistory!.length, 99);
    await sample("unchangedStudentSnapshots192", async () => {
      for (const student of students)
        await svc.view(teacher.code, student.token);
    });
    await sample("quoteReplacements30", async () => {
      for (let i = 0; i < 30; i++)
        await send(buyer.token, { type: "study-quote", price: 40 + (i % 20) });
    });
    await sample("teacherSnapshots20", async () => {
      for (let i = 0; i < 20; i++) await svc.view(teacher.code, teacher.token);
    });
    await sample("streamConnections32", async () => {
      for (const student of students.slice(0, 32)) {
        let seen = false;
        stops.push(
          await realtime.subscribe(teacher.code, student.token, (event) => {
            if (event.type === "snapshot") seen = true;
          }),
        );
        assert.ok(seen);
      }
    });
    const report = {
      participants: 192,
      markets: 12,
      measurement:
        "UTF-8 JSON bytes of SQL result rows, excluding wire protocol/TLS; local only",
      samples,
    };
    const file = process.env.LOCAL_TRANSFER_REPORT;
    if (file) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(report, null, 2) + "\n");
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    stops.forEach((stop) => stop());
    await realtime.close();
    await pg.close();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
