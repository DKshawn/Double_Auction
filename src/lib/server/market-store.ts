import { timed } from "./performance";
import { studyMarketId } from "../study-config";
import type { Database, Sql } from "./database";
import { AuctionError, type AuditEvent, type Room } from "./model";
import type { StudyMarket } from "../study-core";

export type MarketRow = {
  revision?: string;
  market_id: number;
  state: StudyMarket;
  version: number;
  sequence: number;
  receipts: Room["receipts"];
  receipt_count?: number;
  // Transaction-local lookup only; never copied into the legacy JSON column.
  persisted_receipts?: Room["receipts"];
  history_separated: boolean;
  history_cursor: number;
};
export type RootSnapshot = { root: Room; rootRevision?: string };
export type Bundle = RootSnapshot & { markets: MarketRow[]; now: number };

// xmin changes on every row update, including storage migrations that leave the
// application version unchanged. Include the room incarnation and logical version
// too; these are opaque equality tokens, never clocks or ordered transaction IDs.
const rootRevision = `(r.xmin::text || ':' || (r.state->>'version') || ':' || (r.state->>'createdAt'))`;
const marketRevision = `(m.xmin::text || ':' || m.version::text)`;

export async function readRoot(
  db: Sql,
  code: string,
  previous?: RootSnapshot,
  lock?: "SHARE" | "UPDATE",
): Promise<RootSnapshot> {
  if (previous?.root.code !== code) previous = undefined;
  const result = await db.query<{ root: Room | null; root_revision: string }>(
    `SELECT CASE WHEN ${rootRevision} = $2 THEN NULL ELSE r.state END AS root,
      ${rootRevision} AS root_revision
     FROM auction_rooms r WHERE r.code = $1${lock ? ` FOR ${lock}` : ""}`,
    [code, previous?.rootRevision ?? null],
  );
  if (!result.rows.length)
    throw new AuctionError("ルームが見つかりません。", 404);
  return {
    root: result.rows[0].root ?? previous!.root,
    rootRevision: result.rows[0].root_revision,
  };
}

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
            (p) => studyMarketId(root.config, p.seat) === scope,
          ),
        }
      : root,
  );
  room.participantCount = root.participants.filter(
    (p) => !p.withdrawnAt,
  ).length;
  room.study = {
    ...room.study!,
    markets: markets.map((m) => (mutable ? structuredClone(m.state) : m.state)),
  };
  room.receipts = [
    ...root.receipts,
    ...markets.flatMap((m) => [...m.receipts, ...(m.persisted_receipts ?? [])]),
  ];
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
    markets.every(
      (m) => m.state.stage === "done" && m.state.round === room.config.rounds,
    )
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
        .filter((p) => studyMarketId(room.config, p.seat) === market.id)
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
  if (previous?.root.code !== code) previous = undefined;
  const known = Object.fromEntries(
    (previous?.markets ?? []).map((m) => [
      m.market_id,
      {
        revision: m.revision,
        cursor: m.history_separated ? m.history_cursor : 0,
      },
    ]),
  );
  // Revalidate every requested row in the SAME SQL snapshot. An unchanged row
  // returns only its revision; changed rows include hot state and a history suffix.
  // No TTL or cached revision can skip this database check.
  const result = await db.query<{
    root: Room | null;
    root_revision: string;
    markets: {
      market_id: number;
      revision: string;
      data:
        | (MarketRow & {
            history: NonNullable<StudyMarket["orderHistory"]>;
            history_start: number;
          })
        | null;
    }[];
    now: string;
  }>(
    `SELECT CASE WHEN ${rootRevision} = $4 THEN NULL ELSE r.state END AS root,
      ${rootRevision} AS root_revision,
      COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.market_id) FROM (
        SELECT m.market_id, ${marketRevision} AS revision,
          CASE WHEN r.state->>'createdAt' = $5 AND
            ${marketRevision} = $3::jsonb->m.market_id::text->>'revision' THEN NULL
          ELSE jsonb_build_object(
          'state', m.state, 'version', m.version, 'sequence', m.sequence, 'receipts', m.receipts,
          'receipt_count', m.receipt_count,
          'history_separated', m.history_separated, 'history_cursor', m.history_cursor,
          'history_start', c.cursor,
          'history', COALESCE((SELECT jsonb_agg(h.entry ORDER BY h.closed_sequence)
            FROM auction_order_history h WHERE h.room_code = m.room_code
              AND h.market_id = m.market_id AND h.closed_sequence > c.cursor), '[]'::jsonb)) END AS data
        FROM auction_markets m
        CROSS JOIN LATERAL (SELECT CASE WHEN r.state->>'createdAt' = $5 AND
          m.history_separated AND m.history_cursor >=
          COALESCE(($3::jsonb->m.market_id::text->>'cursor')::int, 0)
          THEN COALESCE(($3::jsonb->m.market_id::text->>'cursor')::int, 0) ELSE 0 END AS cursor) c
        WHERE m.room_code = r.code AND ($2::int[] IS NULL OR m.market_id = ANY($2))
      ) x), '[]'::jsonb) AS markets,
      (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now
     FROM auction_rooms r WHERE r.code = $1`,
    [
      code,
      scope === undefined ? null : Array.isArray(scope) ? scope : [scope],
      JSON.stringify(known),
      previous?.rootRevision ?? null,
      previous ? String(previous.root.createdAt) : null,
    ],
  );
  if (!result.rows.length)
    throw new AuctionError("ルームが見つかりません。", 404);
  const value = result.rows[0];
  const markets = value.markets.map(({ market_id, revision, data }) => {
    const cached = previous?.markets.find((m) => m.market_id === market_id);
    if (!data) return cached!;
    const { history, history_start, ...fields } = data;
    const row: MarketRow = { ...fields, market_id, revision };
    if (row.history_separated) {
      const old =
        history_start > 0 &&
        cached?.history_separated &&
        cached.history_cursor === history_start
          ? cached
          : undefined;
      const prefix = old?.state.orderHistory ?? [];
      row.state = {
        ...row.state,
        orderHistory: history.length ? prefix.concat(history) : prefix,
      };
    }
    return row;
  });
  return {
    root: value.root ?? previous!.root,
    rootRevision: value.root_revision,
    markets,
    now: Number(value.now),
  };
}

export async function lockBundle(
  tx: Sql,
  code: string,
  scope?: number,
  includeHistory = false,
  previous?: RootSnapshot,
  receipt?: Room["receipts"][number],
): Promise<Bundle> {
  const result = await timed("db.root_lock_read", () =>
    readRoot(tx, code, previous, scope ? "SHARE" : "UPDATE"),
  );
  // Transactions may partition or edit this root. Never mutate a read cache or
  // expose uncommitted state to another command/feed sharing the process.
  const root = structuredClone(result.root);
  if (!scope) await partition(tx, root);
  if (scope && !root.storageVersion)
    throw new Error("Market storage must be initialized before a scoped write");
  const rows = root.storageVersion
    ? await timed("db.market_lock_read", () =>
        tx.query<MarketRow>(
          `SELECT market_id, state, version, sequence, receipts, receipt_count, history_separated, history_cursor
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
  // A fresh statement AFTER the market lock sees receipts committed by the
  // previous writer, including a concurrent retry from another app process.
  const clock = await tx.query<{
    now: string;
    receipts: { market_id: number; actor: string; requestId: string }[];
  }>(
    `SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('market_id', market_id,
        'actor', actor, 'requestId', request_id) ORDER BY market_id, sequence, actor, request_id)
        FROM auction_market_receipts WHERE room_code = $1
          AND ($2::int IS NULL OR market_id = $2)
          AND ($3::text IS NULL OR actor = $3)
          AND ($4::text IS NULL OR request_id = $4)
          AND $5::boolean), '[]'::jsonb) AS receipts`,
    [
      code,
      scope ?? null,
      receipt?.actor ?? null,
      receipt?.requestId ?? null,
      includeHistory || Boolean(receipt),
    ],
  );
  for (const row of rows.rows)
    row.persisted_receipts = clock.rows[0].receipts
      .filter((r) => r.market_id === row.market_id)
      .map(({ actor, requestId }) => ({ actor, requestId }));
  return { root, markets: rows.rows, now: Number(clock.rows[0].now) };
}

const receiptKey = (receipt: Room["receipts"][number]) =>
  `${receipt.actor}:${receipt.requestId}`;

async function writeMarket(
  tx: Sql,
  room: Room,
  market: StudyMarket,
  old: MarketRow,
  events?: AuditEvent[],
) {
  const ids = new Set(room.participants.map((p) => p.id));
  const known = new Set(
    [...old.receipts, ...(old.persisted_receipts ?? [])].map(receiptKey),
  );
  const receipts = room.receipts.filter(
    (r) =>
      ids.has(r.actor) &&
      !known.has(receiptKey(r)) &&
      studyMarketId(
        room.config,
        room.participants.find((p) => p.id === r.actor)!.seat,
      ) === market.id,
  );
  const entries = (market.orderHistory ?? []).slice(
    old.state.orderHistory?.length ?? 0,
  );
  if (
    entries.some(
      (e, i) =>
        e.closedSequence <=
        (i ? entries[i - 1].closedSequence : old.history_cursor),
    )
  )
    throw new Error("Archived order sequences must increase");
  // One database round trip, one transaction: state, receipt, history, audit and
  // notification either all commit or all roll back. Notification is delivered
  // only after COMMIT, even when PostgreSQL executes the CTEs in another order.
  await tx.query(
    `WITH new_receipts AS (
      INSERT INTO auction_market_receipts (room_code, market_id, actor, request_id, sequence)
      SELECT $1, $2, r->>'actor', r->>'requestId', $4 FROM jsonb_array_elements($5::jsonb) r
      ON CONFLICT DO NOTHING RETURNING request_id
    ), new_history AS (
      INSERT INTO auction_order_history (room_code, market_id, closed_sequence, entry)
      SELECT $1, $2, (e->>'closedSequence')::int, e FROM jsonb_array_elements($6::jsonb) e
    ), saved_market AS (
      UPDATE auction_markets SET state = $3::jsonb, version = version + 1,
        sequence = $4, history_cursor = $7,
        receipt_count = receipt_count + (SELECT count(*)::int FROM new_receipts)
      WHERE room_code = $1 AND market_id = $2
    ), new_events AS (
      INSERT INTO auction_market_events (room_code, market_id, sequence, event)
      SELECT $1, $2, (e->>'sequence')::int, e FROM jsonb_array_elements($8::jsonb) e
    ) SELECT CASE WHEN $9::boolean THEN pg_notify('auction_changes', $10) END`,
    [
      room.code,
      market.id,
      JSON.stringify(hotState(market)),
      room.sequence,
      JSON.stringify(receipts),
      JSON.stringify(entries),
      entries.at(-1)?.closedSequence ?? old.history_cursor,
      JSON.stringify(
        (events ?? []).map((event) => ({ ...event, scope: market.id })),
      ),
      events !== undefined,
      JSON.stringify({ code: room.code, market: market.id }),
    ],
  );
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
  if (scope && room.storageVersion) {
    const old = before.markets.find((m) => m.market_id === scope);
    const market = room.study!.markets.find((m) => m.id === scope);
    if (!old || !market || room.study!.markets.length !== 1)
      throw new Error("Scoped writes must contain exactly their locked market");
    await writeMarket(tx, room, market, old, events);
    room.version = before.root.version + old.version + 1;
    return;
  }
  if (room.storageVersion) {
    const removed = scope
      ? []
      : before.markets.filter(
          (m) => !room.study!.markets.some((next) => next.id === m.market_id),
        );
    const added = room.study!.markets.filter(
      (m) => !before.markets.some((old) => old.market_id === m.id),
    );
    if (
      (removed.length || added.length) &&
      (scope ||
        before.root.phase !== "waiting" ||
        before.markets.some(
          (m) =>
            m.state.periods.length || m.state.trades.length || m.history_cursor,
        ))
    )
      throw new Error(
        "Market layout can only change before any experiment starts",
      );
    const rootVersion =
      before.root.version +
      (scope ? 0 : 1) +
      removed.reduce((sum, m) => sum + m.version, 0);
    let version = rootVersion;
    for (const old of removed)
      await tx.query(
        "DELETE FROM auction_markets WHERE room_code = $1 AND market_id = $2",
        [room.code, old.market_id],
      );
    for (const market of room.study!.markets) {
      const old = before.markets.find((m) => m.market_id === market.id);
      const ids = new Set(
        room.participants
          .filter((p) => studyMarketId(room.config, p.seat) === market.id)
          .map((p) => p.id),
      );
      const receipts = room.receipts.filter((r) => ids.has(r.actor));
      if (!old) {
        await tx.query(
          "INSERT INTO auction_markets (room_code, market_id, state, sequence, receipts, history_separated) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, true)",
          [
            room.code,
            market.id,
            JSON.stringify(hotState(market)),
            room.sequence,
            JSON.stringify(receipts),
          ],
        );
        continue;
      }
      const oldCount = old.state.orderHistory?.length ?? 0;
      const entries = (market.orderHistory ?? []).slice(oldCount);
      const hot = hotState(market);
      const known = new Set(
        [...old.receipts, ...(old.persisted_receipts ?? [])].map(receiptKey),
      );
      const changed =
        entries.length > 0 ||
        JSON.stringify(hotState(old.state)) !== JSON.stringify(hot) ||
        receipts.some((r) => !known.has(receiptKey(r)));
      version += old.version + (changed ? 1 : 0);
      if (!changed) continue;
      await writeMarket(tx, room, market, old);
    }
    if (!scope)
      await tx.query(
        "UPDATE auction_rooms SET state = $2::jsonb, updated_at = clock_timestamp() WHERE code = $1",
        [room.code, JSON.stringify(rootState(room, rootVersion))],
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
