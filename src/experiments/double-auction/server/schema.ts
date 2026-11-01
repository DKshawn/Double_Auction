export const DOUBLE_AUCTION_SCHEMA = [
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
  // Append-only diagnostics; no migration or backfill of existing room/events.
  `CREATE TABLE IF NOT EXISTS auction_action_logs (
    room_code text NOT NULL REFERENCES auction_rooms(code) ON DELETE CASCADE,
    actor text NOT NULL,
    source text NOT NULL,
    event_id text NOT NULL,
    entry jsonb NOT NULL,
    PRIMARY KEY (room_code, actor, source, event_id)
  )`,
  `CREATE TABLE IF NOT EXISTS auction_markets (
    room_code text NOT NULL REFERENCES auction_rooms(code),
    market_id integer NOT NULL,
    state jsonb NOT NULL,
    version integer NOT NULL DEFAULT 0,
    sequence integer NOT NULL DEFAULT 0,
    receipts jsonb NOT NULL DEFAULT '[]',
    PRIMARY KEY (room_code, market_id)
  )`,
  `CREATE TABLE IF NOT EXISTS auction_market_events (
    room_code text NOT NULL,
    market_id integer NOT NULL,
    sequence integer NOT NULL,
    event jsonb NOT NULL,
    PRIMARY KEY (room_code, market_id, sequence),
    FOREIGN KEY (room_code, market_id) REFERENCES auction_markets(room_code, market_id)
  )`,
  `ALTER TABLE auction_markets ADD COLUMN IF NOT EXISTS history_separated boolean NOT NULL DEFAULT false`,
  `ALTER TABLE auction_markets ADD COLUMN IF NOT EXISTS history_cursor integer NOT NULL DEFAULT 0`,
  `ALTER TABLE auction_markets ADD COLUMN IF NOT EXISTS receipt_count integer NOT NULL DEFAULT 0`,
  // New requests append keys here; existing embedded receipts are not migrated.
  `CREATE TABLE IF NOT EXISTS auction_market_receipts (
    room_code text NOT NULL,
    market_id integer NOT NULL,
    actor text NOT NULL,
    request_id text NOT NULL,
    sequence integer NOT NULL,
    PRIMARY KEY (room_code, market_id, actor, request_id),
    FOREIGN KEY (room_code, market_id) REFERENCES auction_markets(room_code, market_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS auction_order_history (
    room_code text NOT NULL,
    market_id integer NOT NULL,
    closed_sequence integer NOT NULL,
    entry jsonb NOT NULL,
    PRIMARY KEY (room_code, market_id, closed_sequence),
    FOREIGN KEY (room_code, market_id) REFERENCES auction_markets(room_code, market_id)
  )`,
];
