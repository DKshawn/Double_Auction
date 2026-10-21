import type { Database } from "./database";
import { AuctionError } from "./model";
import {
  readBundle,
  readRoot,
  type Bundle,
  type RootSnapshot,
} from "./market-store";

// Per-process hints only. Every consumer must validate these revisions in SQL;
// expired credentials, missing rows and database errors must never fall back here.
// Bound both room count and retained serialized size, including archived history.
class ReadCache {
  private entries = new Map<string, { bundle: Bundle; bytes: number }>();
  private sizes = new WeakMap<object, number>();
  private bytes = 0;

  get(code: string) {
    const entry = this.entries.get(code);
    if (entry) {
      this.entries.delete(code);
      this.entries.set(code, entry);
    }
    return entry?.bundle;
  }

  delete(code: string) {
    const entry = this.entries.get(code);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(code);
  }

  private size(value: object) {
    let bytes = this.sizes.get(value);
    if (bytes === undefined) {
      bytes = Buffer.byteLength(JSON.stringify(value));
      this.sizes.set(value, bytes);
    }
    return bytes;
  }

  put(bundle: Bundle, scope?: number | number[]) {
    const code = bundle.root.code;
    const old = this.entries.get(code)?.bundle;
    if (scope !== undefined && old?.root.createdAt === bundle.root.createdAt) {
      const scopes = new Set(Array.isArray(scope) ? scope : [scope]);
      bundle = {
        ...bundle,
        markets: [
          ...old.markets.filter((m) => !scopes.has(m.market_id)),
          ...bundle.markets,
        ],
      };
    }
    this.delete(code);
    const bytes =
      this.size(bundle.root) +
      bundle.markets.reduce((sum, m) => sum + this.size(m), 0);
    if (bytes > 32 * 1024 * 1024) return;
    this.entries.set(code, { bundle, bytes });
    this.bytes += bytes;
    while (this.entries.size > 32 || this.bytes > 32 * 1024 * 1024)
      this.delete(this.entries.keys().next().value!);
  }
}

const caches = new WeakMap<Database, ReadCache>();
function cacheFor(db: Database) {
  let cache = caches.get(db);
  if (!cache) caches.set(db, (cache = new ReadCache()));
  return cache;
}

export function cachedRoomRoot(
  db: Database,
  code: string,
): RootSnapshot | undefined {
  return cacheFor(db).get(code);
}

async function checked<T>(
  cache: ReadCache,
  code: string,
  read: () => Promise<T>,
) {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AuctionError && error.status === 404)
      cache.delete(code);
    throw error;
  }
}

export async function readRoomRoot(db: Database, code: string) {
  const cache = cacheFor(db);
  const next = await checked(cache, code, () =>
    readRoot(db, code, cache.get(code)),
  );
  // An empty scope retains known markets as hints, never as validated results.
  cache.put({ ...next, markets: [], now: 0 }, []);
  return next;
}

export async function readRoomBundle(
  db: Database,
  code: string,
  scope?: number | number[],
  fallback?: Bundle,
) {
  const cache = cacheFor(db);
  const previous = cache.get(code) ?? fallback;
  const next = await checked(cache, code, () =>
    readBundle(db, code, scope, previous),
  );
  cache.put(next, scope);
  return next;
}
