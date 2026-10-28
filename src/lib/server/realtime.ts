import { StudyViewCache } from "../study-view";
import { studyMarketId } from "../study-config";
import type { Room } from "./model";
import { timed, timedSync } from "./performance";
import type { RoomView } from "../types";
import { diffViews } from "../room-sync";
import { authenticate } from "./auth";
import { toView } from "./engine";
import { AuctionError } from "./model";
import type { Database } from "./database";
import { assemble, revisions, type Bundle } from "./market-store";
import { readRoomBundle } from "./room-read-cache";
import { AuctionService } from "./service";

export const MARKET_PUSH_INTERVAL_MS = 40;

export type StreamEvent = {
  type: "snapshot" | "patch" | "heartbeat" | "session-error";
  data: unknown;
};
type Subscriber = {
  token?: string;
  send: (event: StreamEvent) => void;
  observe?: (view: RoomView) => void;
  previous?: RoomView;
};

class RoomFeed {
  subscribers = new Set<Subscriber>();
  private bundle?: Bundle;
  private projections = new StudyViewCache();
  private queued = new Set<number>();
  private worker?: Promise<void>;
  private deadline?: ReturnType<typeof setTimeout>;
  private heartbeat: ReturnType<typeof setInterval>;
  private check: ReturnType<typeof setInterval>;
  private offset = 0;
  private verifiedAt = 0;
  private closed = false;
  constructor(
    private db: Database,
    private code: string,
  ) {
    this.heartbeat = setInterval(() => {
      for (const sub of this.subscribers)
        sub.send(
          Date.now() - this.verifiedAt < 20_000
            ? {
                type: "heartbeat",
                data: { serverTime: Date.now() + this.offset },
              }
            : {
                type: "session-error",
                data: {
                  status: 503,
                  message: "同期を再開しています。しばらくお待ちください。",
                },
              },
        );
    }, 5000);
    this.check = setInterval(
      () => {
        void this.reconcile();
      },
      db.listen ? 15_000 : 1000,
    );
  }
  add(sub: Subscriber) {
    this.subscribers.add(sub);
  }
  remove(sub: Subscriber) {
    this.subscribers.delete(sub);
  }

  refresh(scope: number) {
    if (this.closed) return Promise.resolve();
    this.queued.add(scope);
    this.worker ??= this.drain().finally(() => {
      this.worker = undefined;
    });
    return this.worker;
  }
  private async drain() {
    while (this.queued.size && !this.closed) {
      // Keep a window on EVERY iteration, including a continuously busy market.
      // A one-time debounce would otherwise publish almost every later commit.
      await new Promise((resolve) =>
        setTimeout(resolve, MARKET_PUSH_INTERVAL_MS),
      );
      if (this.closed) return;
      const scopes = [...this.queued];
      this.queued.clear();
      try {
        if (!this.bundle || scopes.includes(0))
          this.bundle = await timed("push.read", () =>
            readRoomBundle(this.db, this.code, undefined, this.bundle),
          );
        else {
          const next = await timed("push.read", () =>
            readRoomBundle(this.db, this.code, scopes, this.bundle),
          );
          if (next.root.version !== this.bundle.root.version) {
            this.bundle = await timed("push.read", () =>
              readRoomBundle(this.db, this.code, undefined, this.bundle),
            );
            scopes.push(0);
          } else {
            this.bundle = {
              ...next,
              markets: this.bundle.markets.map(
                (m) =>
                  next.markets.find((n) => n.market_id === m.market_id) ?? m,
              ),
            };
          }
        }
        this.offset = this.bundle.now - Date.now();
        this.verifiedAt = Date.now();
        timedSync("push.publish_batch", () => this.publish(scopes));
        this.scheduleDeadline();
      } catch (error) {
        this.fail(error);
      }
    }
  }
  private publish(scopes: number[]) {
    const bundle = this.bundle!;
    const rooms = new Map<number | undefined, Room>();
    this.projections.begin();
    for (const sub of this.subscribers) {
      try {
        const actor = authenticate(bundle.root, sub.token);
        const scope =
          actor === "teacher" ||
          !bundle.root.storageVersion ||
          bundle.root.phase === "waiting" ||
          actor.seat < 0
            ? undefined
            : studyMarketId(bundle.root.config, actor.seat);
        if (
          sub.previous &&
          scope &&
          !scopes.includes(0) &&
          !scopes.includes(scope)
        )
          continue;
        let room = rooms.get(scope);
        if (!room) {
          room = timedSync("push.assemble", () =>
            assemble(
              scope
                ? {
                    ...bundle,
                    markets: bundle.markets.filter(
                      (m) => m.market_id === scope,
                    ),
                  }
                : bundle,
              scope,
              false,
            ),
          );
          rooms.set(scope, room);
        }
        const view = timedSync("push.project", () =>
          toView(room!, actor, bundle.now, this.db.mode, this.projections),
        );
        if (sub.previous && sub.previous.version > view.version) continue;
        if (!sub.previous) sub.send({ type: "snapshot", data: view });
        else {
          const patch = timedSync("push.diff", () =>
            diffViews(sub.previous!, view),
          );
          // A valid patch also handles phase changes; avoid serializing the entire
          // history just to choose between a patch and a snapshot for every recipient.
          sub.send({ type: "patch", data: patch });
        }
        sub.previous = view;
        sub.observe?.(view);
      } catch (error) {
        sub.send({
          type: "session-error",
          data: {
            status: error instanceof AuctionError ? error.status : 503,
            message:
              error instanceof AuctionError
                ? error.message
                : "同期を再開しています。",
          },
        });
      }
    }
  }
  private scheduleDeadline() {
    clearTimeout(this.deadline);
    if (this.closed || !this.bundle) return;
    const room = assemble(this.bundle, undefined, false);
    const deadline =
      room.phase === "waiting"
        ? room.study?.lobby?.admission?.closesAt
        : room.phase === "running"
          ? room.deadline
          : null;
    if (deadline == null) return;
    this.deadline = setTimeout(
      () => {
        void new AuctionService(this.db)
          .advance(this.code)
          .then(() => this.refresh(0))
          .catch((error) => {
            this.fail(error);
          });
      },
      Math.max(
        10,
        Math.min(2_147_483_647, deadline - (Date.now() + this.offset) + 5),
      ),
    );
  }
  private async reconcile() {
    if (this.closed) return;
    try {
      if (!this.bundle) {
        await this.refresh(0);
        return;
      }
      const rows = (await revisions(this.db, this.code)).rows;
      this.verifiedAt = Date.now();
      if (rows[0]?.version !== this.bundle.root.version) await this.refresh(0);
      else {
        const changed = rows.filter(
          (r) =>
            r.market &&
            this.bundle!.markets.find((m) => m.market_id === r.market)
              ?.version !== r.version,
        );
        await Promise.all(changed.map((r) => this.refresh(r.market)));
      }
      // Retry a deadline after a transient database failure, even with no new orders.
      this.scheduleDeadline();
    } catch (error) {
      this.fail(error);
    }
  }
  private fail(error: unknown) {
    for (const sub of this.subscribers)
      sub.send({
        type: "session-error",
        data: {
          status: error instanceof AuctionError ? error.status : 503,
          message:
            error instanceof AuctionError
              ? error.message
              : "サーバーとの同期を再開しています。",
        },
      });
    if (error instanceof AuctionError && error.status === 404) this.close();
  }
  close() {
    this.closed = true;
    clearTimeout(this.deadline);
    clearInterval(this.heartbeat);
    clearInterval(this.check);
  }
}

export class RealtimeBroker {
  private feeds = new Map<string, RoomFeed>();
  private listening?: Promise<void>;
  private unlisten?: () => Promise<void>;
  private stopping?: Promise<void>;
  private reconnect?: ReturnType<typeof setTimeout>;
  constructor(private db: Database) {}

  private startListener() {
    if (!this.db.listen || this.listening || this.unlisten)
      return this.listening;
    this.listening = Promise.resolve(this.stopping)
      .then(() =>
        this.db.listen!(
          (payload) => {
            try {
              const event = JSON.parse(payload) as {
                code: string;
                market: number;
              };
              if (
                typeof event.code === "string" &&
                Number.isInteger(event.market)
              )
                void this.feeds.get(event.code)?.refresh(event.market);
            } catch {
              /* Notifications are hints; periodic revision checks repair gaps. */
            }
          },
          () => {
            void this.restartListener();
          },
        ),
      )
      .then((stop) => {
        this.unlisten = stop;
        for (const feed of this.feeds.values()) void feed.refresh(0);
      })
      .catch(() => {
        this.retryListener();
      })
      .finally(() => {
        this.listening = undefined;
      });
    return this.listening;
  }
  private retryListener() {
    clearTimeout(this.reconnect);
    if (this.feeds.size)
      this.reconnect = setTimeout(() => {
        void this.startListener();
      }, 1000);
  }
  private async restartListener() {
    await this.stopListener();
    for (const feed of this.feeds.values()) void feed.refresh(0);
    this.retryListener();
  }
  private stopListener() {
    if (this.stopping) return this.stopping;
    const stop = this.unlisten;
    this.unlisten = undefined;
    if (!stop) return Promise.resolve();
    this.stopping = stop().finally(() => {
      this.stopping = undefined;
    });
    return this.stopping;
  }
  private async releaseListener() {
    await this.listening;
    if (this.feeds.size) return;
    clearTimeout(this.reconnect);
    // The request must await this close; a detached idle timer can be frozen
    // after the last serverless response has ended.
    await this.stopListener();
  }
  async subscribe(
    code: string,
    token: string | undefined,
    send: Subscriber["send"],
    observe?: Subscriber["observe"],
  ) {
    let feed = this.feeds.get(code);
    if (!feed) {
      feed = new RoomFeed(this.db, code);
      this.feeds.set(code, feed);
    }
    const sub: Subscriber = { token, send, observe };
    // Reserve the subscription before awaiting I/O so an older stream closing
    // during a handoff cannot remove this feed or its shared listener.
    feed.add(sub);
    let cleanup: Promise<void> | undefined;
    const stop = () => {
      if (cleanup) return cleanup;
      feed!.remove(sub);
      if (!feed!.subscribers.size) {
        feed!.close();
        if (this.feeds.get(code) === feed) this.feeds.delete(code);
      }
      cleanup = this.releaseListener();
      return cleanup;
    };
    try {
      await this.startListener();
      await feed.refresh(0);
      return stop;
    } catch (error) {
      await stop();
      throw error;
    }
  }
  async close() {
    for (const feed of this.feeds.values()) feed.close();
    this.feeds.clear();
    clearTimeout(this.reconnect);
    await this.listening;
    await this.stopListener();
  }
}

const globals = globalThis as typeof globalThis & {
  auctionBrokers?: WeakMap<Database, RealtimeBroker>;
};
export function broker(db: Database) {
  const brokers = (globals.auctionBrokers ??= new WeakMap());
  let result = brokers.get(db);
  if (!result) {
    result = new RealtimeBroker(db);
    brokers.set(db, result);
  }
  return result;
}
