import type { ClientAction } from "./action-log";

export type PendingAction = { owner: string; event: ClientAction };

// IndexedDB operations never block the UI thread with synchronous storage I/O.
// Unacknowledged records stay on disk across reloads, isolated by room + actor.
export class ActionQueue {
  private memory = new Map<string, PendingAction>();
  private db: Promise<IDBDatabase | null>;
  private writes: Promise<unknown> = Promise.resolve();
  constructor() {
    this.db = new Promise((resolve) => {
      try {
        const request = indexedDB.open("auction-action-log-v1", 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("pending", {
            keyPath: "event.id",
          });
          store.createIndex("owner", "owner");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  put(owner: string, event: ClientAction) {
    const pending = { owner, event };
    this.memory.set(event.id, pending);
    this.writes = this.writes
      .then(async () => {
        const db = await this.db;
        if (!db) return;
        await new Promise<void>((resolve) => {
          const tx = db.transaction("pending", "readwrite");
          tx.objectStore("pending").put(pending);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        });
      })
      .catch(() => {});
  }
  async batch(owner: string) {
    await this.writes;
    const all = new Map<string, ClientAction>();
    try {
      const db = await this.db;
      if (db)
        await new Promise<void>((resolve) => {
          const request = db
            .transaction("pending")
            .objectStore("pending")
            .index("owner")
            .openCursor(IDBKeyRange.only(owner));
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || all.size >= 32) {
              resolve();
              return;
            }
            const entry = cursor.value as PendingAction;
            all.set(entry.event.id, entry.event);
            cursor.continue();
          };
          request.onerror = () => resolve();
        });
    } catch {
      /* Memory remains usable when browser storage is unavailable. */
    }
    for (const { owner: target, event } of this.memory.values())
      if (target === owner) all.set(event.id, event);
    const batch: ClientAction[] = [];
    let bytes = 32;
    for (const event of [...all.values()].sort(
      (a, b) =>
        a.interaction.clickedAt - b.interaction.clickedAt ||
        a.sequence - b.sequence,
    )) {
      const size = new TextEncoder().encode(JSON.stringify(event)).length + 1;
      if (batch.length >= 32 || bytes + size > 28 * 1024) break;
      batch.push(event);
      bytes += size;
    }
    return batch;
  }
  async acknowledge(ids: string[]) {
    for (const id of ids) this.memory.delete(id);
    try {
      const db = await this.db;
      if (db)
        await new Promise<void>((resolve) => {
          const tx = db.transaction("pending", "readwrite");
          for (const id of ids) tx.objectStore("pending").delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        });
    } catch {
      /* Re-uploading an acknowledged ID is idempotent. */
    }
  }
  close() {
    void this.writes.then(async () => (await this.db)?.close());
  }
}
