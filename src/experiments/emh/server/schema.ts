export const EMH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS emh_sessions (
    code text PRIMARY KEY, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS emh_markets (
    room_code text NOT NULL REFERENCES emh_sessions(code) ON DELETE CASCADE,
    market_id integer NOT NULL, state jsonb NOT NULL,
    PRIMARY KEY (room_code, market_id)
  )`,
  `CREATE TABLE IF NOT EXISTS emh_command_receipts (
    room_code text NOT NULL REFERENCES emh_sessions(code) ON DELETE CASCADE,
    actor text NOT NULL, request_id text NOT NULL, payload_hash text NOT NULL,
    PRIMARY KEY (room_code, actor, request_id)
  )`,
  `CREATE TABLE IF NOT EXISTS emh_login_attempts (
    room_code text NOT NULL REFERENCES emh_sessions(code) ON DELETE CASCADE,
    identity text NOT NULL, attempts integer NOT NULL, window_started timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (room_code, identity)
  )`,
];
