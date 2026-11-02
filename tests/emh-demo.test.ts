import assert from "node:assert/strict";
import { test } from "node:test";
import { makeDemo } from "../src/experiments/emh/demo-model";
import { allocationPlan } from "../src/experiments/emh/allocation";
import {
  act,
  assignParticipants,
  phaseKey,
  view,
} from "../src/experiments/emh/engine";
import { DEFAULT_SETTINGS } from "../src/experiments/emh/settings";
import { exportData } from "../src/experiments/emh/export";

test("EMH demo uses formal settings limits, allocation, clocks, reset and settlement through six rounds", () => {
  let now = 1793580000000;
  const settings = {
    ...DEFAULT_SETTINGS,
    initialUnits: 5,
    targetMarketSize: 8,
    typeRatios: [2, 1, 1] as [number, number, number],
    periodSeconds: 90,
  };
  const room = makeDemo("Demo", settings, now);
  assert.equal(room.participants.length, 8);
  assert.deepEqual(room.typeCounts, allocationPlan(8, settings)[0].typeCounts);
  assert.equal(room.config.initialUnits, 5);
  assert.equal(room.config.periodSeconds, 90);
  assert.equal(room.config.rounds, 6);
  assert.equal(room.config.breakSeconds, 60);
  assignParticipants(room, () => 0.4);
  const assignment = room.participants.map((p) => [p.id, p.type, p.seat]);
  const teacher = { role: "teacher" as const };
  const command = (kind: "start" | "end-period" | "next-year") =>
    act(room, teacher, { kind, expectedPhase: phaseKey(room) }, ++now);
  command("start");
  assert.deepEqual(
    room.participants.map((p) => [p.id, p.type, p.seat]),
    assignment,
  );
  assert.equal(room.periodEndsAt, now + 90000);
  assert.equal(
    room.participants.reduce((sum, p) => sum + p.holdings, 0),
    40,
  );
  assert.equal(
    view(room, { role: "student", participantId: "demo-0" }, now).initialUnits,
    5,
  );
  for (let round = 1; round <= 6; round++) {
    command("end-period");
    command("end-period");
    assert.ok(room.participants.every((p) => p.holdings === 0));
    if (round < 6) {
      command("next-year");
      assert.ok(room.participants.every((p) => p.holdings === 5));
    }
  }
  assert.equal(room.status, "completed");
  assert.equal(room.results.length, 12);
  for (const result of room.results) {
    const dividends = room.config.dividends.map((d) =>
      result.period === "A" ? d.a : d.b,
    );
    assert.equal(
      result.initialDividend,
      5 * (4 * dividends[0] + 2 * dividends[1] + 2 * dividends[2]),
    );
    assert.equal(result.actualDividend, result.initialDividend);
    assert.equal(result.maxDividend, 40 * Math.max(...dividends));
    assert.equal(result.gainEfficiency, 0);
  }
  assert.equal(
    JSON.parse(exportData(room, teacher, "conditions").body).rules.totalUnits,
    40,
  );
});

test("EMH demo scales the virtual group and rejects settings rejected by the classroom", () => {
  for (let size = 3; size <= 12; size++) {
    const room = makeDemo(
      "Demo",
      { ...DEFAULT_SETTINGS, targetMarketSize: size },
      Date.now(),
    );
    assert.equal(room.participants.length, size);
    assert.equal(
      room.participants.filter((p) => p.id !== "demo-0").length,
      size - 1,
    );
    assert.ok(room.typeCounts!.every((n) => n >= 1));
  }
  for (const change of [
    { initialUnits: 0 },
    { targetMarketSize: 13 },
    { periodSeconds: 59 },
    { typeRatios: [0, 1, 1] as [number, number, number] },
  ])
    assert.throws(() =>
      makeDemo("Demo", { ...DEFAULT_SETTINGS, ...change }, Date.now()),
    );
});
