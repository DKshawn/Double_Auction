import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyRoom } from "../src/components/study-room";
import { newStudy, stageKey, marketRound } from "../src/lib/server/study";
import { execute, settleDeadline, toView } from "../src/lib/server/engine";
import { exportData } from "../src/lib/server/export";
import { commandSchema } from "../src/lib/server/http";
import type { Room, Participant, AuditEvent } from "../src/lib/server/model";
import type { Command } from "../src/lib/types";
import { DEFAULT_STUDY_TIMING } from "../src/lib/study-timing";
import { DemoSession } from "../src/lib/demo";

function fixture(singleUnit = false) {
  const study = newStudy(1, 6);
  study.markets[0].order = ["posted"];
  const room: Room = {
    code: "DIRECT",
    config: {
      protocol: "institutions-v1",
      title: "Posted直接購入",
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
        purchaseSeconds: 20,
      },
      studyPostedMechanism: "direct-purchase-v1",
      studyCommission: 1,
      ...(singleUnit ? { studyUnitCounts: { posted: 2 } } : {}),
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
    participants: Array.from({ length: 6 }, (_, seat) => ({
      id: randomUUID(),
      seat,
      role: seat < 3 ? ("buyer" as const) : ("seller" as const),
      alias: `${seat < 3 ? "買" : "売"}${(seat % 3) + 1}`,
      nickname: `非公開の氏名${seat}`,
      limits: { apple: 0, banana: 0, orange: 0 },
      tokenHash: "",
      pinHash: "",
      failedLogins: 0,
      lockedUntil: 0,
    })),
  };
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
  const publish = () => settleDeadline(room, 6000, events);
  return {
    room,
    market,
    send,
    publish,
    events,
    buyers: room.participants.slice(0, 3),
    sellers: room.participants.slice(3),
  };
}

test("Posted buyers accept the selected seller's price immediately, regardless of cheaper offers", () => {
  const { room, market, send, publish, events, buyers, sellers } = fixture();
  send(sellers[0], { type: "posted-offer", price: 90, quantity: 2 }, 2000);
  send(sellers[1], { type: "posted-offer", price: 80, quantity: 2 }, 2100);
  assert.deepEqual(
    toView(room, buyers[0], 3000, "local").study!.market.offers,
    [],
  );
  publish();
  assert.equal(market.deadline, 26000);
  assert.equal(market.posted!.endsAt, 26000);
  assert.deepEqual(market.buyerOrder, []);
  const limits = toView(room, buyers[0], 6000, "local").study!.unitLimits!;
  const offer = market.offers[0];
  const requestId = randomUUID();
  send(
    buyers[0],
    { type: "posted-buy", offerId: offer.id, quantity: 2 },
    6100,
    requestId,
  );
  assert.deepEqual(
    market.trades.map((trade) => trade.price),
    [90, 90],
  );
  assert.equal(offer.remaining, 0);
  assert.equal(market.offers[1].remaining, 2);
  const view = toView(room, buyers[0], 6100, "local");
  assert.equal(view.study!.unitsUsed, 2);
  assert.equal(view.me.profit, limits[0] + limits[1] - 180 + 2);
  assert.equal(
    view.study!.market.offers.find((item) => item.id === offer.id)!.remaining,
    0,
  );
  assert.ok(
    view.study!.market.orders.every((order) => order.side === "seller"),
  );
  send(
    buyers[0],
    { type: "posted-buy", offerId: offer.id, quantity: 2 },
    6101,
    requestId,
  );
  assert.equal(market.trades.length, 2);
  assert.equal(events.filter((event) => event.type === "trade").length, 2);
  assert.ok(!events.some((event) => event.type === "posted-batch-cleared"));
  const rules = JSON.parse(
    exportData(room, events, 6200, "settings").content,
  ).rules;
  assert.equal(rules.postedMechanism, "direct-purchase-v1");
  assert.equal(rules.postedExecutionPrice, "seller-offer");
  assert.equal(rules.postedBuyerOrder, "purchase-request-arrival");
  assert.equal(rules.postedBatchMs, undefined);
});

test("Posted refuses overselling, foreign offers, excess quantities, bids and purchases outside the shared window", () => {
  const { room, market, send, publish, buyers, sellers } = fixture();
  send(sellers[0], { type: "posted-offer", price: 90, quantity: 1 }, 2000);
  send(sellers[1], { type: "posted-offer", price: 80, quantity: 2 }, 2100);
  const offerId = market.offers[0].id;
  assert.throws(() =>
    send(buyers[0], { type: "posted-buy", offerId, quantity: 1 }, 3000),
  );
  publish();
  assert.throws(() =>
    send(sellers[0], { type: "posted-buy", offerId, quantity: 1 }, 6100),
  );
  assert.throws(() =>
    send(
      buyers[0],
      { type: "posted-buy", offerId: randomUUID(), quantity: 1 },
      6100,
    ),
  );
  for (const quantity of [0, -1, 1.5, 2, 3])
    assert.throws(() =>
      send(buyers[0], { type: "posted-buy", offerId, quantity }, 6100),
    );
  assert.throws(
    () =>
      send(buyers[0], { type: "posted-bid", price: 100, quantity: 1 }, 6100),
    /提示価格/,
  );
  assert.throws(() => send(buyers[0], { type: "posted-pass" }, 6100));
  send(buyers[0], { type: "posted-buy", offerId, quantity: 1 }, 6200);
  assert.throws(() =>
    send(buyers[1], { type: "posted-buy", offerId, quantity: 1 }, 6201),
  );
  const nextId = market.offers[1].id;
  send(buyers[0], { type: "posted-buy", offerId: nextId, quantity: 1 }, 6202);
  assert.throws(() =>
    send(buyers[0], { type: "posted-buy", offerId: nextId, quantity: 1 }, 6203),
  );
  assert.equal(market.trades.length, 2);
  assert.equal(toView(room, buyers[0], 6203, "local").study!.unitsUsed, 2);
  assert.equal(
    commandSchema.safeParse({
      requestId: randomUUID(),
      expectedRound: 1,
      expectedStage: stageKey(room, market),
      command: { type: "posted-buy", offerId: nextId, quantity: 1, price: 1 },
    }).success,
    false,
    "the buyer cannot supply an execution price",
  );
});

test("a Posted fill exposes the next unit and lets the seller reprice before the remaining shared deadline", () => {
  const { room, market, send, publish, buyers, sellers } = fixture(true);
  send(sellers[0], { type: "posted-offer", price: 90, quantity: 1 }, 2000);
  publish();
  const firstId = market.offers[0].id;
  assert.throws(() =>
    send(
      buyers[0],
      { type: "posted-buy", offerId: firstId, quantity: 2 },
      6100,
    ),
  );
  send(buyers[0], { type: "posted-buy", offerId: firstId, quantity: 1 }, 6100);
  assert.equal(
    market.stage,
    "purchase",
    "temporarily empty inventory must not end the next-unit opportunity",
  );
  assert.equal(market.deadline, 26000);
  assert.equal(toView(room, buyers[0], 6100, "local").study!.unitsUsed, 1);
  send(sellers[0], { type: "posted-offer", price: 110, quantity: 1 }, 6200);
  assert.deepEqual(
    toView(room, buyers[0], 6200, "local").study!.market.offers.map(
      (o) => o.price,
    ),
    [110],
  );
  send(
    buyers[0],
    { type: "posted-buy", offerId: market.offers[1].id, quantity: 1 },
    6300,
  );
  assert.equal(market.stage, "feedback");
  assert.equal(market.trades.length, 2);
  assert.deepEqual(
    market.trades.map((trade) => trade.price),
    [90, 110],
  );
  assert.equal(market.offerHistory!.length, 2);
  assert.equal(
    toView(room, buyers[0], 6300, "local").study!.myTrades.length,
    2,
  );
});

test("Posted shared purchase time survives pauses, and the deadline records unfilled results without an auction", () => {
  const { room, market, send, publish, events, buyers, sellers } = fixture();
  send(sellers[0], { type: "posted-offer", price: 90, quantity: 2 }, 2000);
  publish();
  send("teacher", { type: "pause" }, 6500);
  assert.equal(market.deadline, null);
  assert.equal(
    toView(room, buyers[0], 90000, "local").study!.market.remainingMs,
    19500,
  );
  assert.throws(() =>
    send(
      buyers[0],
      { type: "posted-buy", offerId: market.offers[0].id, quantity: 1 },
      90000,
    ),
  );
  send("teacher", { type: "resume" }, 100000);
  assert.equal(market.deadline, 119500);
  settleDeadline(room, 119499, events);
  assert.equal(market.stage, "purchase");
  settleDeadline(room, 119500, events);
  assert.equal(market.stage, "feedback");
  assert.equal(market.trades.length, 0);
  assert.equal(toView(room, buyers[0], 119500, "local").me.profit, 0);
  assert.ok(!events.some((event) => event.type === "posted-batch-cleared"));
});

test("Posted keeps one public card per seller between a fill and the next unit's new offer", () => {
  const { room, market, send, publish, buyers, sellers } = fixture(true);
  send(sellers[0], { type: "posted-offer", price: 90, quantity: 1 }, 2000);
  send(sellers[1], { type: "posted-offer", price: 80, quantity: 1 }, 2100);
  publish();
  const first = toView(room, buyers[0], 6000, "local").study!.market.offers;
  for (let i = 0; i < 2; i++)
    send(
      buyers[i],
      { type: "posted-buy", offerId: first[i].id, quantity: 1 },
      6100 + i,
    );
  const between = toView(room, buyers[0], 6102, "local").study!.market;
  assert.equal(between.stage, "purchase");
  assert.equal(between.offers.length, first.length);
  assert.deepEqual(
    between.offers.map((offer) => offer.participantId),
    first.map((offer) => offer.participantId),
  );
  assert.ok(between.offers.every((offer) => offer.remaining === 0));
  assert.throws(() =>
    send(
      buyers[2],
      { type: "posted-buy", offerId: first[0].id, quantity: 1 },
      6103,
    ),
  );
  send(sellers[0], { type: "posted-offer", price: 95, quantity: 1 }, 6200);
  send(sellers[1], { type: "posted-offer", price: 100, quantity: 1 }, 6201);
  const updated = toView(room, buyers[0], 6202, "local").study!.market.offers;
  assert.equal(updated.length, first.length);
  assert.deepEqual(
    updated.map((offer) => offer.participantId),
    first.map((offer) => offer.participantId),
  );
  assert.deepEqual(
    updated.map((offer) => offer.price),
    [95, 100],
  );
  assert.ok(
    updated.every(
      (offer) =>
        offer.remaining === 1 && !first.some((old) => old.id === offer.id),
    ),
  );
  assert.equal(
    market.offerHistory!.length,
    4,
    "all quote records remain available in history",
  );
});

test("Posted demo cards do not disappear in the 250ms gap after the bots buy the first unit", async () => {
  for (const role of ["buyer", "seller"] as const) {
    const demo = new DemoSession("posted", role, 1000, {
      config: {
        protocol: "institutions-v1",
        title: "报价稳定性",
        markets: 1,
        marketSize: 16,
        capacity: 16,
        rounds: 1,
        duration: 180,
        studyInstitutions: ["posted"],
        studyPeriods: { posted: 1 },
        studyUnitCounts: { cda: 2, call: 2, posted: 2 },
        studyTiming: {
          ...DEFAULT_STUDY_TIMING,
          offerSeconds: 5,
          purchaseSeconds: 80,
        },
      },
    });
    await demo.command({ type: "start" }, true);
    if (role === "seller")
      await demo.command({ type: "posted-offer", price: 52, quantity: 1 });
    demo.skipStage();
    const first = demo.getSnapshot().view.study!.market.offers;
    assert.equal(first.length, 8);
    const owners = first.map((offer) => offer.participantId).sort();
    demo.tick(1000);
    demo.tick(1000);
    const between = demo.getSnapshot().view.study!.market.offers;
    assert.equal(between.length, 8);
    assert.deepEqual(
      between.map((offer) => offer.participantId).sort(),
      owners,
    );
    assert.ok(between.some((offer) => offer.remaining === 0));
    demo.tick(250);
    const updated = demo.getSnapshot().view.study!.market.offers;
    assert.equal(updated.length, 8);
    assert.deepEqual(
      updated.map((offer) => offer.participantId).sort(),
      owners,
    );
    assert.ok(
      updated.some((offer) => !first.some((old) => old.id === offer.id)),
    );
  }
});

test("Posted buyer UI shows ascending offers and purchase buttons, with no price entry or buyer depth", () => {
  const { room, market, send, publish, buyers, sellers } = fixture(true);
  send(sellers[0], { type: "posted-offer", price: 90, quantity: 1 }, 2000);
  send(sellers[1], { type: "posted-offer", price: 80, quantity: 1 }, 2100);
  publish();
  const render = (actor: Participant, disabled = false) =>
    renderToStaticMarkup(
      createElement(StudyRoom, {
        view: toView(room, actor, 6100, "local"),
        now: 6100,
        command: async () => true,
        disabled,
        connected: true,
        error: "",
        notice: "",
        retry: () => {},
        demo: true,
      }),
    );
  const html = render(buyers[0]);
  assert.match(html, /売り手の提示価格/);
  assert.match(html, /80 円で1単位購入/);
  assert.match(html, /90 円で1単位購入/);
  assert.ok(
    html.indexOf('aria-label="80 円で1単位購入"') <
      html.indexOf('aria-label="90 円で1単位購入"'),
  );
  assert.doesNotMatch(
    html,
    /買い気配単位|買いたい価格|買い注文を出す|posted\.bid|type="number"/,
  );
  assert.match(html, /<small[^>]*>利益 \d+ 円<\/small>/);
  const buttons = (markup: string) =>
    [
      ...markup.matchAll(/<button\b[^>]*data-audit-button="posted.buy"[^>]*>/g),
    ].map(([button]) => button);
  assert.equal(buttons(html).length, 2);
  assert.ok(buttons(html).every((button) => !button.includes("disabled")));
  assert.ok(
    buttons(render(buyers[0], true)).every((button) =>
      button.includes("disabled"),
    ),
  );
  assert.ok(
    buttons(render(sellers[0])).every((button) => button.includes("disabled")),
  );
  send(
    buyers[0],
    { type: "posted-buy", offerId: market.offers[1].id, quantity: 1 },
    6150,
  );
  const filled = render(buyers[0]);
  assert.equal([...filled.matchAll(/class="study-offer-card"/g)].length, 2);
  assert.match(filled, /disabled="">売り切れ<\/button>/);
  assert.equal(buttons(filled).length, 1, "a sold-out quote cannot be clicked");
  send("teacher", { type: "pause" }, 6200);
  assert.ok(
    buttons(render(buyers[0])).every((button) => button.includes("disabled")),
  );
});
