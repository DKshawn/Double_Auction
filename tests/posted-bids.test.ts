import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { postedBatchPlan, postedBookOrders } from "../src/lib/posted-auction";
import { newStudy, stageKey, marketRound } from "../src/lib/server/study";
import { execute, settleDeadline, toView } from "../src/lib/server/engine";
import type { Room, Participant, AuditEvent } from "../src/lib/server/model";
import type { Command } from "../src/lib/types";
import type { PostedBid, PostedOffer } from "../src/lib/study-types";
import {
  DEFAULT_STUDY_TIMING,
  postedPurchaseSeconds,
  studyRemainingMs,
} from "../src/lib/study-timing";
import { exportData } from "../src/lib/server/export";

function fixture() {
  const study = newStudy(1, 6);
  study.markets[0].order = ["posted"];
  const room: Room = {
    code: "POST22",
    config: {
      protocol: "institutions-v1",
      title: "Posted新規則",
      markets: 1,
      marketSize: 6,
      capacity: 6,
      rounds: 1,
      duration: 180,
      studyInstitutions: ["posted"],
      studyPeriods: { posted: 1 },
      studyTiming: {
        ...DEFAULT_STUDY_TIMING,
        offerSeconds: 5,
        purchaseSeconds: 4,
      },
      studyPostedMechanism: "batch-bids-v1",
    },
    study,
    phase: "waiting",
    round: 0,
    version: 1,
    deadline: null,
    remainingMs: 0,
    createdAt: 0,
    teacherTokenHash: "",
    teacherPasswordHash: "",
    teacherFailedLogins: 0,
    teacherLockedUntil: 0,
    seats: [],
    quotes: [],
    trades: [],
    sequence: 0,
    receipts: [],
    participants: [],
  };
  for (let seat = 0; seat < 6; seat++)
    room.participants.push({
      id: randomUUID(),
      seat,
      role: seat < 3 ? "buyer" : "seller",
      alias: `${seat < 3 ? "買" : "売"}${(seat % 3) + 1}`,
      nickname: `秘密の氏名${seat}`,
      limits: { apple: 0, banana: 0, orange: 0 },
      tokenHash: "",
      pinHash: "",
      failedLogins: 0,
      lockedUntil: 0,
    });
  const events: AuditEvent[] = [];
  const market = study.markets[0];
  const send = (
    actor: Participant | "teacher",
    command: Command,
    now: number,
    requestId = randomUUID(),
  ) =>
    execute(
      room,
      actor,
      {
        requestId,
        expectedRound: marketRound(room, market),
        expectedStage: stageKey(room, market),
        command,
      },
      now,
      events,
    );
  send("teacher", { type: "start" }, 1000);
  return {
    room,
    market,
    send,
    events,
    buyers: room.participants.slice(0, 3),
    sellers: room.participants.slice(3),
  };
}

test("Posted accepts every buyer, reserves capacity and fills only at a batch cutoff, highest bid to cheapest offer", () => {
  const { room, market, send, events, buyers, sellers } = fixture();
  send(sellers[0], { type: "posted-offer", price: 90, quantity: 2 }, 2000);
  send(sellers[1], { type: "posted-offer", price: 80, quantity: 1 }, 2100);
  assert.equal(
    toView(room, buyers[0], 3000, "local").study!.market.orders.length,
    0,
  );
  settleDeadline(room, 6000, events);
  assert.equal(market.deadline, 7000);
  assert.equal(market.posted!.endsAt, 10000);
  assert.deepEqual(market.buyerOrder, []);
  assert.equal(
    toView(room, buyers[2], 6000, "local").study!.market.activeBuyer,
    null,
  );
  send(buyers[0], { type: "posted-bid", price: 90, quantity: 1 }, 6100);
  send(buyers[1], { type: "posted-bid", price: 120, quantity: 2 }, 6200);
  assert.equal(market.trades.length, 0);
  const json = JSON.stringify(toView(room, buyers[2], 6200, "local"));
  for (const other of [...buyers.slice(0, 2), ...sellers])
    assert.ok(!json.includes(other.nickname));
  assert.equal(
    toView(room, buyers[0], 6200, "local").study!.market.orders.length,
    6,
  );
  assert.throws(
    () =>
      send(buyers[1], { type: "posted-bid", price: 125, quantity: 1 }, 6300),
    /購入可能数/,
  );
  for (const command of [
    { type: "posted-buy", offerId: market.offers[0].id, quantity: 1 },
    { type: "posted-pass" },
    { type: "study-cancel" },
    { type: "study-quote", price: 100 },
  ] as const)
    assert.throws(() => send(buyers[0], command, 6400));
  settleDeadline(room, 6999, events);
  assert.equal(market.trades.length, 0);
  settleDeadline(room, 7000, events);
  assert.deepEqual(
    market.trades.map((trade) => [trade.buyerId, trade.price]),
    [
      [buyers[1].id, 80],
      [buyers[1].id, 90],
      [buyers[0].id, 90],
    ],
  );
  assert.equal(market.stage, "feedback");
  const settings = JSON.parse(
    exportData(room, events, 7000, "settings").content,
  );
  assert.equal(settings.rules.postedMechanism, "batch-bids-v1");
  assert.equal(settings.rules.postedPurchaseSeconds, 4);
});

test("equal bids use the recorded random draw, never arrival order; equal offers use submission sequence", () => {
  const bid = (id: string, sequence: number): PostedBid => ({
    id,
    participantId: id,
    alias: id,
    price: 100,
    quantity: 1,
    remaining: 1,
    sequence,
    at: sequence,
  });
  const offer = (id: string, sequence: number): PostedOffer => ({
    id,
    participantId: id,
    alias: id,
    price: 80,
    quantity: 1,
    remaining: 1,
    sequence,
  });
  const bids = [bid("early", 1), bid("later", 2)];
  const offers = [offer("seller-later", 5), offer("seller-early", 3)];
  const plan = postedBatchPlan(bids, offers, 1000, (ids) => ids.toReversed());
  assert.deepEqual(plan.lotteries, [
    {
      price: 100,
      candidates: ["early", "later"],
      priority: ["later", "early"],
    },
  ]);
  assert.deepEqual(
    plan.matches.map((m) => [m.bidId, m.offerId, m.price]),
    [
      ["later", "seller-early", 80],
      ["early", "seller-later", 80],
    ],
  );
  assert.ok([...bids, ...offers].every((order) => order.remaining === 1));
  const atCutoff = { ...bid("cutoff", 3), at: 1000 };
  assert.equal(postedBatchPlan([atCutoff], offers, 1000).matches.length, 0);
  assert.equal(
    postedBookOrders([{ ...bids[0], remaining: 0 }], offers).length,
    2,
  );
});

test("bids below all offers remain pending, pause/resume freezes both clocks, restart catches up exactly once", () => {
  const { room, market, send, events, buyers, sellers } = fixture();
  send(sellers[0], { type: "posted-offer", price: 110, quantity: 2 }, 2000);
  settleDeadline(room, 6000, events);
  const requestId = randomUUID();
  send(
    buyers[0],
    { type: "posted-bid", price: 90, quantity: 2 },
    6100,
    requestId,
  );
  send(
    buyers[0],
    { type: "posted-bid", price: 90, quantity: 2 },
    6200,
    requestId,
  );
  assert.equal(market.posted!.bids.length, 1);
  send("teacher", { type: "pause" }, 6500);
  const paused = toView(room, buyers[0], 90000, "local");
  assert.equal(
    studyRemainingMs(paused.phase, paused.study!.market, 90000),
    3500,
  );
  send("teacher", { type: "resume" }, 100000);
  assert.equal(market.deadline, 100500);
  assert.equal(market.posted!.endsAt, 103500);
  const restored = JSON.parse(JSON.stringify(room)) as Room;
  settleDeadline(restored, 103500, events);
  const completed = restored.study!.markets[0];
  assert.equal(completed.trades.length, 0);
  assert.equal(completed.stage, "feedback");
  assert.equal(completed.posted!.bids.length, 0);
  assert.equal(
    events.filter((event) => event.type === "posted-batch-cleared").length,
    4,
  );
  const eventCount = events.length;
  settleDeadline(restored, 103500, events);
  assert.equal(events.length, eventCount);
});

test("lottery audit persists across reads/retries and later bids cannot enter an earlier draw", () => {
  const { room, market, send, events, buyers, sellers } = fixture();
  send(sellers[0], { type: "posted-offer", price: 80, quantity: 1 }, 2000);
  send(sellers[1], { type: "posted-offer", price: 200, quantity: 2 }, 2000);
  settleDeadline(room, 6000, events);
  const id = randomUUID();
  send(buyers[0], { type: "posted-bid", price: 100, quantity: 1 }, 6100, id);
  send(buyers[1], { type: "posted-bid", price: 100, quantity: 1 }, 6200);
  settleDeadline(room, 7000, events);
  const audit = events.find((event) => event.type === "posted-batch-cleared")!;
  const saved = JSON.stringify(audit);
  const priority = (audit.detail.lotteries as { priority: string[] }[])[0]
    .priority;
  const winning = market.posted!.bids.find((bid) => bid.id === priority[0])!;
  assert.equal(market.trades[0].buyerId, winning.participantId);
  toView(room, buyers[0], 7001, "local");
  send(buyers[0], { type: "posted-bid", price: 100, quantity: 1 }, 7002, id);
  send(buyers[2], { type: "posted-bid", price: 100, quantity: 1 }, 7100);
  assert.equal(JSON.stringify(audit), saved);
  assert.ok(!saved.includes(market.posted!.bids.at(-1)!.id));
  assert.equal(market.trades.length, 1);
});

test("Posted default shared duration preserves the former total time budget", () => {
  assert.equal(postedPurchaseSeconds({ marketSize: 16 }), 80);
  assert.equal(
    postedPurchaseSeconds({
      marketSize: 4,
      studyTiming: { ...DEFAULT_STUDY_TIMING, buyerSeconds: 7 },
    }),
    14,
  );
  assert.equal(
    postedPurchaseSeconds({
      marketSize: 16,
      studyTiming: { ...DEFAULT_STUDY_TIMING, purchaseSeconds: 61 },
    }),
    61,
  );
});
