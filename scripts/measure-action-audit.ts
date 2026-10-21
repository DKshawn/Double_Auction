// In-memory only: never reads database URLs or opens an existing experiment.
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  localDatabase,
  migrate,
  type Database,
  type Sql,
} from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { lockBundle, saveBundle } from "../src/lib/server/market-store";
import { settleDeadline } from "../src/lib/server/engine";
import type { AuditEvent } from "../src/lib/auction-model";

async function main() {
  const attendance = Number(process.argv[2] ?? 2);
  if (
    !Number.isInteger(attendance) ||
    attendance < 2 ||
    attendance > 998 ||
    attendance % 2
  )
    throw new Error("Use an even attendance between 2 and 998");
  const pg = new PGlite();
  const base = localDatabase(pg);
  let queries = 0;
  const count = (sql: Sql): Sql => ({
    query: (...args) => {
      queries++;
      return sql.query(...args);
    },
  });
  const db: Database = {
    mode: "local",
    query: count(base).query,
    transaction: (fn) => base.transaction((tx) => fn(count(tx))),
  };
  try {
    await migrate(db);
    const service = new AuctionService(db);
    const teacher = await service.create(
      {
        title: "Audit benchmark",
        protocol: "institutions-v1",
        capacity: attendance,
        marketSize: attendance,
        markets: 1,
        rounds: 15,
        duration: 3600,
      },
      "Benchmark-2026",
      "",
    );
    const initial = await service.export(teacher.code, teacher.token);
    delete initial.room.study!.lobby;
    initial.room.study!.markets[0].order = ["cda", "call", "posted"];
    await db.transaction(async (tx) =>
      saveBundle(tx, await lockBundle(tx, teacher.code), initial.room, []),
    );
    const students = [];
    for (let i = 0; i < attendance; i++)
      students.push(await service.join(teacher.code, `B${i}`, "1234"));
    const student = students[0];
    await service.command(teacher.code, teacher.token, {
      requestId: randomUUID(),
      expectedRound: 0,
      command: { type: "start" },
    });
    const started = await service.export(teacher.code, teacher.token);
    const events: AuditEvent[] = [];
    if (started.room.study!.markets[0].stage === "countdown")
      settleDeadline(
        started.room,
        started.room.study!.markets[0].deadline!,
        events,
      );
    await db.transaction(async (tx) =>
      saveBundle(tx, await lockBundle(tx, teacher.code), started.room, events),
    );
    let view = await service.view(teacher.code, student.token);
    const elapsed: number[] = [],
      counts: number[] = [];
    for (let i = 0; i < 80; i++) {
      const before = queries,
        start = performance.now();
      view = await service.command(teacher.code, student.token, {
        requestId: randomUUID(),
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        interaction: {
          id: randomUUID(),
          button: "quote.submit",
          clickedAt: Date.now(),
          clockOffsetMs: 0,
          tabId: "00000000-0000-4000-8000-000000000001",
          elapsedMs: i,
        },
        command: { type: "study-quote", price: 50 + (i % 2) },
      });
      if (i >= 10) {
        elapsed.push(performance.now() - start);
        counts.push(queries - before);
      }
    }
    elapsed.sort((a, b) => a - b);
    const views = await Promise.all(
      students.map((student) => service.view(teacher.code, student.token)),
    );
    const burstBefore = queries,
      burstStart = performance.now();
    const burst = await Promise.all(
      students.map(async (student, index) => {
        const start = performance.now(),
          current = views[index];
        await service.command(teacher.code, student.token, {
          requestId: randomUUID(),
          expectedRound: current.round,
          expectedStage: current.study!.market.stageKey,
          command: {
            type: "study-quote",
            price: current.me.role === "buyer" ? 1 : 99999,
          },
          interaction: {
            id: randomUUID(),
            button: "quote.submit",
            clickedAt: Date.now(),
            clockOffsetMs: 0,
            tabId: "00000000-0000-4000-8000-000000000001",
            elapsedMs: index,
          },
        });
        return performance.now() - start;
      }),
    );
    burst.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        storage: "isolated in-memory PGlite",
        attendance,
        samples: elapsed.length,
        p50Ms: elapsed[Math.floor(elapsed.length * 0.5)],
        p95Ms: elapsed[Math.floor(elapsed.length * 0.95)],
        sqlPerCommand: [...new Set(counts)],
        burst: {
          requests: burst.length,
          p50Ms: burst[Math.floor(burst.length * 0.5)],
          p95Ms: burst[Math.floor(burst.length * 0.95)],
          totalMs: performance.now() - burstStart,
          sqlTotal: queries - burstBefore,
        },
      }),
    );
  } finally {
    await pg.close();
  }
}
void main();
