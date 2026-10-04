import { timed } from "./performance";
import type { Database, Sql } from "./database";
import { AuctionError, type AuditEvent, type Room } from "./model";
import type { StudyMarket } from "../study-core";

export type MarketRow = {
  market_id: number;
  state: StudyMarket;
  version: number;
  sequence: number;
  receipts: Room["receipts"];
  history_separated: boolean;
  history_cursor: number;
};
export type Bundle = { root: Room; markets: MarketRow[]; now: number };

export function assemble(
  { root, markets }: Bundle,
  scope?: number,
  mutable = true,
): Room {
  if (!root.storageVersion) return structuredClone(root);
  const copy = <T>(value: T): T =>
    mutable ? structuredClone(value) : { ...value };
  const room = copy(
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
  room.study = {
    ...room.study!,
    markets: markets.map((m) => (mutable ? structuredClone(m.state) : m.state)),
  };
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

// Archived CDA orders are immutable and are not needed to execute new commands.
// The cursor index lets a live feed fetch only entries committed since its snapshot.
function hotState(market: StudyMarket) {
  const { orderHistory: _history, ...hot } = market;
  void _history;
  return hot;
}
async function appendHistory(
  tx: Sql,
  code: string,
  id: number,
  entries: NonNullable<StudyMarket["orderHistory"]>,
) {
  if (!entries.length) return;
  await tx.query(
    `INSERT INTO auction_order_history (room_code, market_id, closed_sequence, entry)
     SELECT $1, $2, (e->>'closedSequence')::int, e FROM jsonb_array_elements($3::jsonb) e`,
    [code, id, JSON.stringify(entries)],
  );
}
async function separateHistory(tx: Sql, code: string, row: MarketRow) {
  if (row.history_separated) return;
  const entries = row.state.orderHistory ?? [];
  await appendHistory(tx, code, row.market_id, entries);
  row.history_cursor = entries.at(-1)?.closedSequence ?? 0;
  row.history_separated = true;
  await tx.query(
    `UPDATE auction_markets SET state = state - 'orderHistory', history_separated = true,
      history_cursor = $3 WHERE room_code = $1 AND market_id = $2`,
    [code, row.market_id, row.history_cursor],
  );
}

export async function readBundle(
  db: Sql,
  code: string,
  scope?: number | number[],
  previous?: Bundle,
): Promise<Bundle> {
  const cursors = Object.fromEntries(
    (previous?.markets ?? [])
      .filter((m) => m.history_separated)
      .map((m) => [m.market_id, m.history_cursor]),
  );
  // Metadata, hot state and history suffix all come from the SAME SQL snapshot.
  const result = await db.query<{
    root: Room;
    markets: (MarketRow & {
      history: NonNullable<StudyMarket["orderHistory"]>;
      history_start: number;
    })[];
    now: string;
  }>(
    `SELECT r.state AS root,
      COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.market_id) FROM (
        SELECT m.market_id, m.state, m.version, m.sequence, m.receipts,
          m.history_separated, m.history_cursor, c.cursor AS history_start,
          COALESCE((SELECT jsonb_agg(h.entry ORDER BY h.closed_sequence)
            FROM auction_order_history h WHERE h.room_code = m.room_code
              AND h.market_id = m.market_id AND h.closed_sequence > c.cursor), '[]'::jsonb) AS history
        FROM auction_markets m
        CROSS JOIN LATERAL (SELECT CASE WHEN m.history_separated AND m.history_cursor >=
          COALESCE(($3::jsonb->>m.market_id::text)::int, 0)
          THEN COALESCE(($3::jsonb->>m.market_id::text)::int, 0) ELSE 0 END AS cursor) c
        WHERE m.room_code = r.code AND ($2::int[] IS NULL OR m.market_id = ANY($2))
      ) x), '[]'::jsonb) AS markets,
      (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now
     FROM auction_rooms r WHERE r.code = $1`,
    [
      code,
      scope === undefined ? null : Array.isArray(scope) ? scope : [scope],
      JSON.stringify(cursors),
    ],
  );
  if (!result.rows.length)
    throw new AuctionError("ルームが見つかりません。", 404);
  const value = result.rows[0];
  const markets = value.markets.map(({ history, history_start, ...row }) => {
    if (row.history_separated) {
      const old = previous?.markets.find(
        (m) =>
          m.market_id === row.market_id &&
          m.history_separated &&
          m.history_cursor === history_start,
      );
      const prefix = old?.state.orderHistory ?? [];
      row.state = {
        ...row.state,
        orderHistory: history.length ? prefix.concat(history) : prefix,
      };
    }
    return row;
  });
  return { root: value.root, markets, now: Number(value.now) };
}

export async function lockBundle(
  tx: Sql,
  code: string,
  scope?: number,
  includeHistory = false,
): Promise<Bundle> {
  const result = await timed("db.root_lock_read", () =>
    tx.query<{ state: Room }>(
      `SELECT state FROM auction_rooms WHERE code = $1 FOR ${scope ? "SHARE" : "UPDATE"}`,
      [code],
    ),
  );
  if (!result.rows.length)
    throw new AuctionError("ルームが見つかりません。", 404);
  const root = result.rows[0].state;
  if (!scope) await partition(tx, root);
  if (scope && !root.storageVersion)
    throw new Error("Market storage must be initialized before a scoped write");
  const rows = root.storageVersion
    ? await timed("db.market_lock_read", () =>
        tx.query<MarketRow>(
          `SELECT market_id, state, version, sequence, receipts, history_separated, history_cursor
     FROM auction_markets WHERE room_code = $1 AND ($2::int IS NULL OR market_id = $2)
     ORDER BY market_id FOR UPDATE`,
          [code, scope ?? null],
        ),
      )
    : { rows: [] };
  for (const row of rows.rows) {
    await separateHistory(tx, code, row);
    row.state = { ...row.state, orderHistory: [] };
  }
  if (includeHistory && rows.rows.length) {
    const history = await tx.query<{
      market_id: number;
      entries: NonNullable<StudyMarket["orderHistory"]>;
    }>(
      `SELECT market_id, jsonb_agg(entry ORDER BY closed_sequence) AS entries
       FROM auction_order_history WHERE room_code = $1 AND market_id = ANY($2::int[]) GROUP BY market_id`,
      [code, rows.rows.map((m) => m.market_id)],
    );
    for (const row of rows.rows)
      row.state.orderHistory =
        history.rows.find((h) => h.market_id === row.market_id)?.entries ?? [];
  }
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
    let version = before.root.version + (scope ? 0 : 1);
    for (const market of room.study!.markets) {
      const old = before.markets.find((m) => m.market_id === market.id)!;
      const ids = new Set(
        room.participants
          .filter((p) => Math.floor(p.seat / 16) + 1 === market.id)
          .map((p) => p.id),
      );
      const receipts = room.receipts.filter((r) => ids.has(r.actor));
      const oldCount = old.state.orderHistory?.length ?? 0;
      const entries = (market.orderHistory ?? []).slice(oldCount);
      const hot = hotState(market);
      const changed =
        entries.length > 0 ||
        JSON.stringify(hotState(old.state)) !== JSON.stringify(hot) ||
        JSON.stringify(old.receipts) !== JSON.stringify(receipts);
      version += old.version + (changed ? 1 : 0);
      if (!changed) continue;
      if (
        entries.some(
          (e, i) =>
            e.closedSequence <=
            (i ? entries[i - 1].closedSequence : old.history_cursor),
        )
      )
        throw new Error("Archived order sequences must increase");
      await appendHistory(tx, room.code, market.id, entries);
      await tx.query(
        `UPDATE auction_markets SET state = $3::jsonb, version = version + 1, sequence = $4,
          receipts = $5::jsonb, history_cursor = $6 WHERE room_code = $1 AND market_id = $2`,
        [
          room.code,
          market.id,
          JSON.stringify(hot),
          room.sequence,
          JSON.stringify(receipts),
          entries.at(-1)?.closedSequence ?? old.history_cursor,
        ],
      );
    }
    if (!scope)
      await tx.query(
        "UPDATE auction_rooms SET state = $2::jsonb, updated_at = clock_timestamp() WHERE code = $1",
        [room.code, JSON.stringify(rootState(room, before.root.version + 1))],
      );
    room.version = version;
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
