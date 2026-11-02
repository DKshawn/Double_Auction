import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  addParticipant,
  newRoom,
  phaseKey,
  unitKey,
  view,
} from "../src/experiments/emh/engine";
import { EXP2_CONFIG } from "../src/experiments/emh/server/default-config";
import { exportData } from "../src/experiments/emh/export";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomDashboard } from "../src/experiments/emh/components/room-dashboard";

test("Exp2 settles one period per round and protects clue cards", () => {
  const room = newRoom("EXP234", EXP2_CONFIG, 0);
  for (let i = 0; i < 12; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `name${i}`,
        studentId: `s${i}`,
        pinHash: "",
        tokenHash: "",
      },
      0,
    );
  const teacher = { role: "teacher" } as const;
  const student = (id: string) =>
    ({ role: "student", participantId: id }) as const;
  const random = () => 0.999;
  act(
    room,
    teacher,
    { kind: "start", expectedPhase: phaseKey(room) },
    0,
    random,
  );
  for (const type of [1, 2, 3])
    assert.equal(
      room.participants.filter((p) => p.type === type && p.insider).length,
      2,
    );
  assert.equal(room.periodEndsAt, 300000);
  assert.equal(view(room, student("p0"), 0).exp2!.clue, null);
  act(
    room,
    student("p0"),
    { kind: "quote", side: "ask", price: 100, unitKey: unitKey(room) },
    1,
    random,
  );
  act(
    room,
    student("p4"),
    { kind: "quote", side: "bid", price: 100, unitKey: unitKey(room) },
    2,
    random,
  );
  for (let year = 1; year <= 6; year++) {
    const informed = room.participants.find((p) => p.insider)!;
    const uninformed = room.participants.find((p) => !p.insider)!;
    const informedView = view(room, student(informed.id), year * 10);
    const uninformedView = view(room, student(uninformed.id), year * 10);
    assert.equal(
      informedView.exp2!.clue,
      year > 2 ? EXP2_CONFIG.states!.outcomes[year - 1] : null,
    );
    assert.equal(uninformedView.exp2!.clue, null);
    assert.equal(uninformedView.exp2!.allDividends, null);
    assert.equal(uninformedView.participants.length, 0);
    assert.equal(uninformedView.exp2!.state, null);
    act(
      room,
      teacher,
      { kind: "end-period", expectedPhase: phaseKey(room) },
      year * 10 + 1,
      random,
    );
    const result = room.results.at(-1)!;
    assert.equal(result.state, EXP2_CONFIG.states!.outcomes[year - 1]);
    assert.ok(Math.abs(result.piPrice! - (year <= 4 ? 142.09 : 232)) < 1e-8);
    assert.ok(
      Math.abs(result.rePrice! - (year <= 2 ? 142.09 : year <= 4 ? 136 : 232)) <
        1e-8,
    );
    assert.ok(room.participants.every((p) => p.holdings === 0));
    assert.equal(
      view(room, student(uninformed.id), year * 10 + 1).results.at(-1)!.piPrice,
      undefined,
    );
    if (year === 1) {
      assert.equal(room.participants[0]!.totalProfit, 190);
      assert.equal(room.participants[4]!.totalProfit, 56);
    }
    if (year < 6) {
      assert.equal(room.status, "break");
      act(
        room,
        teacher,
        { kind: "next-year", expectedPhase: phaseKey(room) },
        year * 10 + 2,
        random,
      );
      assert.ok(
        room.participants.every((p) => p.holdings === 2 && p.cash === 0),
      );
    }
  }
  assert.equal(room.status, "completed");
  assert.equal(room.results.length, 6);
  assert.match(exportData(room, teacher, "results").body, /RE_price/);
  assert.match(
    exportData(room, teacher, "participants").body,
    /insider_rounds_3_to_6/,
  );
  assert.doesNotMatch(
    exportData(room, student("p0"), "conditions").body,
    /insider/,
  );
});

test("formal Exp2 student view presents state conditions, both quote forms and records together", () => {
  const room = newRoom("EXP234", EXP2_CONFIG, 0);
  for (let i = 0; i < 12; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `name${i}`,
        studentId: `s${i}`,
        pinHash: "",
        tokenHash: "",
      },
      0,
    );
  act(
    room,
    { role: "teacher" },
    { kind: "start", expectedPhase: phaseKey(room) },
    0,
    () => 0.999,
  );
  const studentRoom = view(room, { role: "student", participantId: "p0" }, 0);
  const html = renderToStaticMarkup(
    createElement(RoomDashboard, { room: studentRoom, act: async () => {} }),
  );
  assert.match(html, /状態別の配当 \/ 確率/);
  assert.match(html, /買値を提示/);
  assert.match(html, /売値を提示/);
  assert.match(html, /取引価格/);
  assert.match(html, /あなたの記録/);
  assert.doesNotMatch(html, /role="tablist"/);
});
