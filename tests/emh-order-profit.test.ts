import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  addParticipant,
  advanceClock,
  newRoom,
  phaseKey,
  view,
} from "../src/experiments/emh/engine";
import { DEFAULT_CONFIG } from "../src/experiments/emh/server/default-config";
import { orderProfitPreview } from "../src/experiments/emh/order-profit";
import type { QuoteView } from "../src/experiments/emh/types";

function setup() {
  const room = newRoom(
    "PROFIT",
    {
      ...structuredClone(DEFAULT_CONFIG),
      dividends: [
        { a: 120, b: 40 },
        { a: 100, b: 60 },
        { a: 150, b: 30 },
      ],
    },
    0,
  );
  for (let i = 0; i < 3; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `n${i}`,
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
    -5000,
    () => 0.99,
  );
  advanceClock(room, 0, () => 0.99);
  const result = view(room, { role: "student", participantId: "p0" }, 0);
  result.me!.dividends = { a: 120, b: 40 };
  return result;
}
function quote(price: number, participantId: string | null = null): QuoteView {
  return { id: "quote", price, participantId, seat: null, at: 0 };
}

test("Exp1 estimates one unit against remaining round dividends, excluding dividends already paid in B", () => {
  const room = setup();
  assert.deepEqual(orderProfitPreview(room, "bid", "150"), {
    limit: 10,
    market: null,
  });
  assert.deepEqual(orderProfitPreview(room, "ask", "170"), {
    limit: 10,
    market: null,
  });
  room.period = "B";
  room.me!.dividend = 240;
  room.me!.cash = -200;
  assert.equal(orderProfitPreview(room, "bid", "150").limit, -110);
  assert.equal(orderProfitPreview(room, "ask", "170").limit, 130);
});

test("crossing limit and market estimates use the standing opposing execution price", () => {
  const room = setup();
  room.ask = quote(177);
  assert.deepEqual(orderProfitPreview(room, "bid", "180"), {
    limit: -17,
    market: -17,
  });
  assert.equal(orderProfitPreview(room, "bid", "170").limit, -10);
  room.bid = quote(135);
  assert.deepEqual(orderProfitPreview(room, "ask", "130"), {
    limit: -25,
    market: -25,
  });
  assert.equal(orderProfitPreview(room, "ask", "160").limit, 0);
  room.pausedAt = 1;
  assert.equal(orderProfitPreview(room, "bid", "180").market, -17);
});

test("all positive integer limits within the price bounds can queue, including equal or less aggressive prices", () => {
  const room = setup();
  for (const price of [
    "",
    " ",
    "0",
    "-1",
    "1.5",
    "100001",
    "NaN",
    "Infinity",
  ]) {
    assert.equal(orderProfitPreview(room, "bid", price).limit, null, price);
    assert.equal(orderProfitPreview(room, "ask", price).limit, null, price);
  }
  room.bid = quote(100);
  room.ask = quote(200);
  for (const price of ["99", "100"])
    assert.equal(
      orderProfitPreview(room, "bid", price).limit,
      160 - Number(price),
    );
  for (const price of ["200", "201"])
    assert.equal(
      orderProfitPreview(room, "ask", price).limit,
      Number(price) - 160,
    );
  room.ownQuotes.ask = { status: "active", price: 210, quoteId: "own-ask" };
  room.me!.holdings = 1;
  assert.deepEqual(orderProfitPreview(room, "ask", "210"), {
    limit: null,
    market: null,
  });
  assert.deepEqual(orderProfitPreview(room, "ask", "99"), {
    limit: -60,
    market: null,
  });
  assert.equal(orderProfitPreview(room, "bid", "101").limit, 59);
  assert.equal(orderProfitPreview(room, "ask", "199").limit, 39);
});

test("own opposing quotes, no securities, missing private values and settled rounds do not show actionable profit", () => {
  const room = setup();
  room.ask = quote(177, room.me!.id);
  assert.deepEqual(orderProfitPreview(room, "bid", "180"), {
    limit: null,
    market: null,
  });
  assert.equal(orderProfitPreview(room, "bid", "170").limit, -10);
  room.bid = quote(135, room.me!.id);
  assert.deepEqual(orderProfitPreview(room, "ask", "130"), {
    limit: null,
    market: null,
  });
  room.me!.holdings = 0;
  assert.deepEqual(orderProfitPreview(room, "ask", "160"), {
    limit: null,
    market: null,
  });
  room.me!.dividends = null;
  assert.equal(orderProfitPreview(room, "bid", "170").limit, null);
  room.me = null;
  assert.equal(orderProfitPreview(room, "bid", "170").limit, null);
  const settled = setup();
  settled.status = "completed";
  assert.equal(orderProfitPreview(settled, "bid", "100").limit, null);
});

test("Exp2 uses the student's prior-weighted dividends or own clue, never realized state or other types", () => {
  const room = setup();
  room.exp2 = {
    prior: [0.35, 0.42, 0.23],
    dividends: [80, 110, 170],
    clue: null,
    state: 3,
    allDividends: [[100000, 100000, 100000]],
  };
  const uninformed = orderProfitPreview(room, "bid", "100").limit!;
  assert.ok(Math.abs(uninformed - 13.3) < 1e-9);
  assert.ok(
    Math.abs(orderProfitPreview(room, "ask", "100").limit! + 13.3) < 1e-9,
  );
  room.exp2.state = 1;
  room.exp2.allDividends = null;
  assert.equal(orderProfitPreview(room, "bid", "100").limit, uninformed);
  room.exp2.clue = 3;
  assert.equal(orderProfitPreview(room, "bid", "100").limit, 70);
  room.exp2.dividends = [0, 0, 0];
  assert.equal(orderProfitPreview(room, "bid", "100").limit, -100);
  room.exp2.dividends = null;
  assert.equal(orderProfitPreview(room, "bid", "100").limit, null);
});
