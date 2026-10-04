import type { Database } from "./database";
import { timed } from "./performance";

const queues = new WeakMap<Database, Map<string, Promise<void>>>();

// Wait before borrowing a database connection. PostgreSQL's row lock remains the
// authority across processes; one busy market cannot occupy the whole pool here.
export async function inMarketQueue<T>(
  db: Database,
  code: string,
  scope: number | undefined,
  work: () => Promise<T>,
): Promise<T> {
  if (!scope) return work();
  let pending = queues.get(db);
  if (!pending) queues.set(db, (pending = new Map()));
  const key = `${code}:${scope}`;
  const previous = pending.get(key);
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  pending.set(key, done);
  try {
    if (previous) await timed("command.market_queue_wait", () => previous);
    return await work();
  } finally {
    release();
    if (pending.get(key) === done) pending.delete(key);
  }
}
