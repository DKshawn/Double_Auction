import type { Database, Sql } from "./database";
import { AuctionError, type AuditEvent, type Room } from "./model";
import type { StudyMarket } from "../study-core";

export type MarketRow = {
  market_id: number;
  state: StudyMarket;
  version: number;
  sequence: number;
  receipts: Room["receipts"];
};
export type Bundle = { root: Room; markets: MarketRow[]; now: number };

export function assemble({ root, markets }: Bundle, scope?: number): Room {
  if (!root.storageVersion) return structuredClone(root);
  const room = structuredClone(
    scope
      ? {
          ...root,
          participants: root.participants.filter(
            (p) => Math.floor(p.seat / 16) + 1 === scope,
          ),
        }
      : root,
  );
  room.participantCount = root.participants.length;
  room.study!.markets = markets.map((m) => structuredClone(m.state));
  room.receipts = [...root.receipts, ...markets.flatMap((m) => m.receipts)];
  room.sequence = Math.max(root.sequence, ...markets.map((m) => m.sequence));
  room.version = root.version + markets.reduce((sum, m) => sum + m.version, 0);
  room.round = Math.max(
    0,
    ...markets.map((m) => m.state.round ?? m.state.periods.at(-1)?.round ?? 0),
  );
  const deadlines = markets.flatMap((m) =>
    m.state.deadline === null ? [] : [m.state.deadline],
  );
  room.deadline = deadlines.length ? Math.min(...deadlines) : null;
  if (
    ["running", "paused"].includes(root.phase) &&
    markets.length &&
    markets.every((m) => m.state.stage === "done" && m.state.round === 15)
  )
    room.phase = "finished";
  return room;
}

function rootState(room: Room, version: number) {
  const root = structuredClone(room);
  delete root.participantCount;
  root.storageVersion = 2;
  root.version = version;
  root.study!.markets = [];
  root.receipts = room.receipts.filter((r) => r.actor === "teacher");
  // Progress and deadlines are derived from independent market rows.
  root.round = 0;
  root.deadline = null;
  return root;
}

export async function partition(tx: Sql, room: Room) {
  if (!room.study || room.storageVersion) return;
  for (const market of room.study.markets) {
    const ids = new Set(
      room.participants
        .filter((p) => Math.floor(p.seat / 16) + 1 === market.id)
        .map((p) => p.id),
    );
    await tx.query(
      `INSERT INTO auction_markets (room_code, market_id, state, sequence, receipts)
       VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)`,
      [
        room.code,
        market.id,
        JSON.stringify(market),
        room.sequence,
        JSON.stringify(room.receipts.filter((r) => ids.has(r.actor))),
      ],
    );
  }
  const root = rootState(room, room.version);
  await tx.query("UPDATE auction_rooms SET state = $2::jsonb WHERE code = $1", [
    room.code,
    JSON.stringify(root),
  ]);
  Object.assign(room, root);
}

export async function readBundle(
  db: Sql,
  code: string,
  scope?: number,
): Promise<Bundle> {
  // One SQL snapshot prevents mixing a teacher control with an earlier market state.
  const result = await db.query<{
    root: Room;
    markets: MarketRow[];
    now: string;
  }>(
    `SELECT r.state AS root,
      COALESCE((SELECT jsonb_agg(to_jsonb(m) - 'room_code' ORDER BY m.market_id)
        FROM auction_markets m WHERE m.room_code = r.code AND ($2::int IS NULL OR m.market_id = $2)), '[]'::jsonb) AS markets,
      (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now
     FROM auction_rooms r WHERE r.code = $1`,
    [code, scope ?? null],
  );
  if (!result.rows.length)
    throw new AuctionError("ルームが見つかりません。", 404);
  return { ...result.rows[0], now: Number(result.rows[0].now) };
}

export async function lockBundle(
  tx: Sql,
  code: string,
  scope?: number,
): Promise<Bundle> {
  // Shared metadata lock allows different markets to write concurrently. Teacher
  // controls/admission use an exclusive lock, then markets in ascending ID order.
  const result = await tx.query<{ state: Room }>(
    `SELECT state FROM auction_rooms WHERE code = $1 FOR ${scope ? "SHARE" : "UPDATE"}`,
    [code],
  );
  if (!result.rows.length)
    throw new AuctionError("ルームが見つかりません。", 404);
  const root = result.rows[0].state;
  if (!scope) await partition(tx, root);
  if (scope && !root.storageVersion)
    throw new Error("Market storage must be initialized before a scoped write");
  const rows = root.storageVersion
    ? await tx.query<MarketRow>(
        "SELECT market_id, state, version, sequence, receipts FROM auction_markets WHERE room_code = $1 AND ($2::int IS NULL OR market_id = $2) ORDER BY market_id FOR UPDATE",
        [code, scope ?? null],
      )
    : { rows: [] };
  const clock = await tx.query<{ now: string }>(
    "SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now",
  );
  return { root, markets: rows.rows, now: Number(clock.rows[0].now) };
}

export async function writeEvents(
  tx: Sql,
  code: string,
  events: AuditEvent[],
  scope = 0,
) {
  if (!events.length) return;
  const saved = events.map((event) => ({ ...event, scope }));
  await tx.query(
    scope
      ? "INSERT INTO auction_market_events (room_code, market_id, sequence, event) SELECT $1, $3, (e->>'sequence')::int, e FROM jsonb_array_elements($2::jsonb) AS e"
      : "INSERT INTO auction_events (room_code, sequence, event) SELECT $1, (e->>'sequence')::int, e FROM jsonb_array_elements($2::jsonb) AS e",
    scope
      ? [code, JSON.stringify(saved), scope]
      : [code, JSON.stringify(saved)],
  );
}

export async function saveBundle(
  tx: Sql,
  before: Bundle,
  room: Room,
  events: AuditEvent[],
  scope?: number,
) {
  if (room.storageVersion) {
    for (const market of room.study!.markets) {
      const old = before.markets.find((m) => m.market_id === market.id)!;
      const ids = new Set(
        room.participants
          .filter((p) => Math.floor(p.seat / 16) + 1 === market.id)
          .map((p) => p.id),
      );
      const receipts = room.receipts.filter((r) => ids.has(r.actor));
      if (
        JSON.stringify(old.state) !== JSON.stringify(market) ||
        JSON.stringify(old.receipts) !== JSON.stringify(receipts)
      ) {
        await tx.query(
          `UPDATE auction_markets SET state = $3::jsonb, version = version + 1, sequence = $4, receipts = $5::jsonb
           WHERE room_code = $1 AND market_id = $2`,
          [
            room.code,
            market.id,
            JSON.stringify(market),
            room.sequence,
            JSON.stringify(receipts),
          ],
        );
      }
    }
    if (!scope)
      await tx.query(
        "UPDATE auction_rooms SET state = $2::jsonb, updated_at = clock_timestamp() WHERE code = $1",
        [room.code, JSON.stringify(rootState(room, before.root.version + 1))],
      );
  } else {
    room.version++;
    await tx.query(
      "UPDATE auction_rooms SET state = $2::jsonb, updated_at = clock_timestamp() WHERE code = $1",
      [room.code, JSON.stringify(room)],
    );
  }
  await writeEvents(tx, room.code, events, scope);
  // Delivered only after COMMIT. The payload contains no orders, identities or conditions.
  await tx.query("SELECT pg_notify('auction_changes', $1)", [
    JSON.stringify({ code: room.code, market: scope ?? 0 }),
  ]);
}

export async function revisions(db: Database, code: string) {
  return db.query<{ version: number; market: number }>(
    `SELECT (state->>'version')::int AS version, 0 AS market FROM auction_rooms WHERE code = $1
     UNION ALL SELECT version, market_id AS market FROM auction_markets WHERE room_code = $1 ORDER BY market`,
    [code],
  );
}
