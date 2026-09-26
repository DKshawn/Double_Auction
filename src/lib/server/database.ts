import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";

export interface Sql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database {
  mode: "local" | "online";
  query: Sql["query"];
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS auction_rooms (
    code text PRIMARY KEY,
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS auction_events (
    room_code text NOT NULL REFERENCES auction_rooms(code),
    sequence integer NOT NULL,
    event jsonb NOT NULL,
    PRIMARY KEY (room_code, sequence)
  )`,
];

export function localDatabase(pg: PGlite): Database {
  return {
    mode: "local",
    query: (sql, params) => pg.query(sql, params),
    transaction: (fn) => pg.transaction((tx) => fn(tx)),
  };
}

const globals = globalThis as typeof globalThis & {
  auctionDatabase?: Promise<Database>;
};

async function open(): Promise<Database> {
  let db: Database;
  if (process.env.DATABASE_URL) {
    neonConfig.webSocketConstructor = ws;
    const url = process.env.DATABASE_URL;
    const http = neon(url);
    db = {
      mode: "online",
      query: async <T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) => ({ rows: (await http.query(sql, params ?? [])) as T[] }),
      async transaction<T>(fn: (tx: Sql) => Promise<T>) {
        // A request-scoped connection must not outlive a serverless invocation.
        const pool = new Pool({
          connectionString: url,
          connectionTimeoutMillis: 10_000,
          max: 1,
        });
        try {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query("SET LOCAL lock_timeout = '8s'");
            await client.query("SET LOCAL statement_timeout = '15s'");
            const result = await fn(client);
            await client.query("COMMIT");
            return result;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        } finally {
          await pool.end();
        }
      },
    };
  } else {
    if (process.env.VERCEL)
      throw new Error("DATABASE_URL is required on Vercel");
    const { PGlite } = await import("@electric-sql/pglite");
    // Local data is created at runtime; it must never be traced into a deployment.
    const dir = path.resolve(
      /* turbopackIgnore: true */ process.env.PGLITE_DATA_DIR ||
        ".data/auction",
    );
    await mkdir(path.dirname(dir), { recursive: true });
    db = localDatabase(new PGlite(dir));
  }
  await migrate(db);
  return db;
}

export async function migrate(db: Database) {
  for (const statement of SCHEMA) await db.query(statement);
}

export function database(): Promise<Database> {
  globals.auctionDatabase ??= open().catch((error) => {
    globals.auctionDatabase = undefined;
    throw error;
  });
  return globals.auctionDatabase;
}

export async function databaseTime(tx: Sql) {
  const result = await tx.query<{ now: string }>(
    "SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now",
  );
  return Number(result.rows[0].now);
}
