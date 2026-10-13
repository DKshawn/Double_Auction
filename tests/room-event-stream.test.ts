import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomEventStream } from "../src/lib/room-event-stream";
import { diffViews } from "../src/lib/room-sync";
import type { RoomView } from "../src/lib/types";

class FakeSource {
  readyState = 1;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (event: { data: string }) => void>();
  addEventListener(type: string, callback: (event: { data: string }) => void) {
    this.listeners.set(type, callback);
  }
  close() {
    this.readyState = 2;
  }
  send(type: string, data: unknown = {}) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) });
  }
}
const view = (version: number) =>
  ({ code: "STREAM", version, serverTime: version * 1000 }) as RoomView;
function fixture() {
  const sources: FakeSource[] = [],
    views: number[] = [],
    heartbeats: number[] = [],
    sessions: number[] = [];
  let errors = 0,
    minimumVersion = 0;
  const stream = new RoomEventStream(
    "/events",
    {
      view(next) {
        if (next.version < minimumVersion) return false;
        views.push(next.version);
        return true;
      },
      heartbeat(time) {
        heartbeats.push(time);
      },
      error() {
        errors++;
      },
      sessionError(error) {
        sessions.push(error.status);
      },
    },
    () => {
      const source = new FakeSource();
      sources.push(source);
      return source as unknown as EventSource;
    },
  );
  stream.connect();
  sources[0].send("snapshot", view(1));
  return {
    stream,
    sources,
    views,
    heartbeats,
    sessions,
    errors: () => errors,
    minimum: (n: number) => {
      minimumVersion = n;
    },
  };
}

test("planned rotation retains the old connection until a caught-up snapshot, with separate patch bases", () => {
  const f = fixture();
  try {
    const old = f.sources[0];
    old.send("rotate");
    old.send("rotate");
    assert.equal(f.sources.length, 2);
    const replacement = f.sources[1];
    replacement.send("heartbeat", { serverTime: 9999 });
    assert.deepEqual(f.heartbeats, []);
    old.send("patch", diffViews(view(1), view(3)));
    replacement.send("snapshot", view(2));
    assert.equal(
      old.readyState,
      1,
      "stale replacement cannot displace the live stream",
    );
    replacement.send("patch", diffViews(view(2), view(3)));
    assert.equal(old.readyState, 2);
    old.send("patch", diffViews(view(3), view(9)));
    old.onerror?.();
    replacement.send("patch", diffViews(view(3), view(4)));
    assert.deepEqual(f.views, [1, 3, 3, 4]);
    assert.equal(f.errors(), 0);
  } finally {
    f.stream.close();
  }
});

test("a more recent command response also prevents an older replacement snapshot from taking over", () => {
  const f = fixture();
  try {
    f.minimum(4);
    f.sources[0].send("rotate");
    f.sources[1].send("snapshot", view(3));
    assert.equal(f.sources[0].readyState, 1);
    f.sources[1].send("patch", diffViews(view(3), view(4)));
    assert.equal(f.sources[0].readyState, 2);
  } finally {
    f.stream.close();
  }
});

test("failed or invalid handoffs preserve the live source; actual active-source failures are reported", () => {
  const f = fixture();
  try {
    f.sources[0].send("rotate");
    f.sources[1].onerror?.();
    assert.equal(f.sources[1].readyState, 2);
    assert.equal(f.sources[0].readyState, 1);
    assert.equal(f.errors(), 0);
    f.sources[0].send("rotate");
    f.sources[2].send("patch", diffViews(view(1), view(2)));
    assert.equal(
      f.sources[2].readyState,
      2,
      "patch without snapshot is rejected",
    );
    f.sources[0].onerror?.();
    assert.equal(f.errors(), 1);
  } finally {
    f.stream.close();
  }
});

test("unresponsive handoff times out, and session expiry closes both sources without stale recovery", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.sources[0].send("rotate");
  t.mock.timers.tick(8000);
  assert.equal(f.sources[1].readyState, 2);
  assert.equal(f.sources[0].readyState, 1);
  f.sources[0].send("rotate");
  f.sources[2].send("session-error", { status: 401, message: "expired" });
  assert.ok(f.sources.every((source) => source.readyState === 2));
  f.sources[0].send("heartbeat", { serverTime: 9000 });
  f.sources[2].send("snapshot", view(5));
  assert.deepEqual(f.views, [1]);
  assert.deepEqual(f.heartbeats, []);
  assert.deepEqual(f.sessions, [401]);
});

test("offline/unmount close drops late snapshots and heartbeats from both connections", () => {
  const f = fixture();
  f.sources[0].send("rotate");
  f.stream.close();
  for (const source of f.sources) {
    assert.equal(source.readyState, 2);
    source.send("heartbeat", { serverTime: 9000 });
    source.send("snapshot", view(6));
  }
  assert.deepEqual(f.views, [1]);
  assert.deepEqual(f.heartbeats, []);
});
