import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoSession } from "../src/lib/demo";
import {
  RoomStreamRotation,
  STREAM_HANDOFF_GRACE_MS,
  STREAM_LATEST_ROTATE_MS,
} from "../src/lib/room-stream-rotation";
import {
  studyTimingError,
  DEFAULT_STUDY_TIMING,
  studyPeriodTransition,
} from "../src/lib/study-timing";

async function fixture(seconds = 240) {
  const demo = new DemoSession("cda", "buyer", 1000, {
    config: {
      title: "CDA接続の切り替え",
      protocol: "institutions-v1",
      markets: 1,
      marketSize: 2,
      capacity: 2,
      rounds: 2,
      duration: seconds,
      studyInstitutions: ["cda"],
      studyPeriods: { cda: 2 },
      studyTiming: { ...DEFAULT_STUDY_TIMING, cdaSeconds: seconds },
    },
  });
  assert.equal(await demo.command({ type: "start" }, true), true);
  return { demo, view: demo.getSnapshot().view };
}

test("240 seconds is advisory: 241 and 3600 remain valid and retain their trading deadlines", async () => {
  for (const seconds of [240, 241, 3600]) {
    assert.equal(
      studyTimingError({ ...DEFAULT_STUDY_TIMING, cdaSeconds: seconds }),
      "",
    );
    const { view } = await fixture(seconds);
    assert.equal(
      view.study!.market.deadline! - view.serverTime,
      seconds * 1000,
    );
  }
});

test("short CDA rotates at End once, and a replacement opened in End does not rotate again", async () => {
  const { demo, view } = await fixture(20);
  const plan = new RoomStreamRotation();
  assert.equal(plan.observe(view, 0).reason, "timeout");
  demo.advanceTime(20);
  const end = demo.getSnapshot().view;
  assert.equal(end.study!.market.stage, "feedback");
  assert.deepEqual(plan.observe(end, 20_000), { delay: 0, reason: "period" });
  assert.equal(plan.observe(end, 20_001).reason, "timeout");
  const replacement = new RoomStreamRotation();
  assert.equal(replacement.observe(end, 0).reason, "timeout");
  demo.advanceTime(8);
  replacement.observe(demo.getSnapshot().view, 8000);
  demo.advanceTime(20);
  assert.equal(
    replacement.observe(demo.getSnapshot().view, 28000).reason,
    "period",
  );
});

test("exactly four minutes waits for End; Start/End overhead cannot extend a request past its safe bound", async () => {
  const { view } = await fixture();
  const market = view.study!.market;
  // Connection starts in the eight-second transition before the next 240s period.
  market.stage = "feedback";
  market.deadline = view.serverTime + 8000;
  const plan = new RoomStreamRotation().observe(view, 0);
  assert.equal(plan.delay, 250_000);
  assert.ok(plan.delay + STREAM_HANDOFF_GRACE_MS < 300_000);
  // A long preceding wait or pause must not move the connection's lifetime limit.
  assert.equal(new RoomStreamRotation().observe(view, 100_000).delay, 140_000);
  assert.ok(STREAM_LATEST_ROTATE_MS + STREAM_HANDOFF_GRACE_MS < 300_000);
});

test("long CDA, teachers, waiting and pauses keep the four-minute fallback", async () => {
  const { view } = await fixture(241);
  assert.equal(new RoomStreamRotation().observe(view, 239_000).delay, 1000);
  view.config.studyTiming!.cdaSeconds = 180;
  for (const phase of ["waiting", "paused", "finished"] as const) {
    view.phase = phase;
    assert.equal(new RoomStreamRotation().observe(view, 241_000).delay, 0);
  }
  view.phase = "running";
  view.me.role = "teacher";
  assert.equal(new RoomStreamRotation().observe(view, 239_000).delay, 1000);
});

test("CDA End/Start uses shared server time, freezes when paused and accepts no orders during the transition", async () => {
  const { demo } = await fixture(20);
  const transition = () => {
    const { view, now } = demo.getSnapshot();
    return studyPeriodTransition(
      view.config,
      view.phase,
      view.study!.market,
      now,
    );
  };
  demo.advanceTime(20);
  assert.deepEqual(transition(), { kind: "End", period: 1, seconds: 3 });
  assert.equal(await demo.command({ type: "study-quote", price: 100 }), false);
  assert.match(demo.getSnapshot().error, /取引時間外/);
  demo.advanceTime(3);
  assert.deepEqual(transition(), { kind: "Start", period: 2, seconds: 5 });
  await demo.command({ type: "pause" }, true);
  const paused = structuredClone(demo.getSnapshot().view);
  assert.deepEqual(
    studyPeriodTransition(
      paused.config,
      paused.phase,
      paused.study!.market,
      900_000,
    ),
    transition(),
  );
  demo.advanceTime(300);
  assert.deepEqual(transition(), { kind: "Start", period: 2, seconds: 5 });
  await demo.command({ type: "resume" }, true);
  demo.advanceTime(5);
  assert.equal(transition(), null);
  assert.equal(demo.getSnapshot().view.study!.market.round, 2);
  assert.equal(demo.getSnapshot().view.study!.market.remainingMs, 20_000);
  demo.advanceTime(20);
  assert.deepEqual(transition(), { kind: "End", period: 2, seconds: 3 });
  demo.advanceTime(3);
  assert.equal(transition(), null, "there is no nonexistent period 3 Start");
});
