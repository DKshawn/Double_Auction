import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyRoom } from "../src/components/study-room";
import { DemoSession } from "../src/lib/demo";

function history(session: DemoSession) {
  const { view, now } = session.getSnapshot();
  const html = renderToStaticMarkup(
    createElement(StudyRoom, {
      view,
      now,
      command: session.command,
      disabled: false,
      connected: true,
      error: "",
      notice: "",
      retry: () => {},
      demo: true,
    }),
  );
  const section = html.match(
    /<section[^>]*aria-label="市場の注文・約定履歴"[^>]*>([\s\S]*?)<\/section>/,
  )?.[1];
  assert.ok(
    section,
    "the trading screen must include a visible market history",
  );
  const body = section.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) =>
      cell[1].replace(/<[^>]*>/g, "").trim(),
    ),
  );
  return { section, rows };
}

test("Posted history retains published quotes and sold-out trades across periods", async () => {
  const session = new DemoSession("posted", "buyer", 1000);
  await session.command({ type: "start" }, true);
  assert.deepEqual(history(session).rows, []);
  assert.deepEqual(session.getSnapshot().view.study!.market.offerHistory, []);

  session.skipToHuman();
  const market = session.getSnapshot().view.study!.market;
  assert.equal(market.offerHistory.length, 8);
  const quotedRows = history(session).rows.filter(
    (row) => row[2] === "価格提示",
  );
  assert.equal(quotedRows.length, 8);
  assert.ok(quotedRows.every((row) => row[4] === "2単位"));
  const offer = market.offers.find((offer) => offer.remaining === 2)!;
  assert.ok(
    offer,
    "inventory must be available when the human buyer's turn starts",
  );
  const tradeCount = market.trades.length;
  assert.equal(
    await session.command({
      type: "posted-buy",
      offerId: offer.id,
      quantity: 2,
    }),
    true,
  );
  const afterPurchase = session.getSnapshot().view.study!.market;
  assert.equal(afterPurchase.trades.length, tradeCount + 2);
  assert.ok(!afterPurchase.offers.some((item) => item.id === offer.id));
  assert.equal(
    afterPurchase.offerHistory.find((item) => item.id === offer.id)!.quantity,
    2,
  );
  const { rows } = history(session);
  assert.equal(rows.filter((row) => row[2] === "価格提示").length, 8);
  assert.equal(
    rows.filter((row) => row[2].startsWith("約定")).length,
    tradeCount + 2,
  );
  assert.ok(rows.slice(0, 2).every((row) => row[2] === "約定あなた"));

  for (
    let turn = 0;
    turn < 8 && session.getSnapshot().view.study!.market.round === 1;
    turn++
  ) {
    session.skipStage();
  }
  assert.equal(session.getSnapshot().view.study!.market.round, 2);
  assert.equal(session.getSnapshot().view.study!.market.stage, "offer");
  assert.equal(
    history(session).rows.filter((row) => row[2] === "価格提示").length,
    8,
  );
  assert.ok(history(session).rows.every((row) => row[0].startsWith("第1期")));
});

test("sellers see only published Posted quotes in institution-relative periods", async () => {
  const session = new DemoSession("call", "seller", 1000);
  await session.command({ type: "start" }, true);
  for (let stage = 0; stage < 25; stage++) session.skipStage();
  assert.equal(session.getSnapshot().view.study!.market.round, 11);
  assert.equal(session.getSnapshot().view.study!.market.institution, "posted");
  assert.equal(
    await session.command({ type: "posted-offer", price: 91, quantity: 2 }),
    true,
  );
  assert.deepEqual(history(session).rows, []);
  assert.doesNotMatch(history(session).section, /91|Call Market|CDA/);
  session.skipStage();

  const { section, rows } = history(session);
  assert.equal(rows.length, 8);
  assert.ok(rows.every((row) => row[0] === "第1期"));
  assert.match(section, /全体の第11期/);
  assert.deepEqual(rows.find((row) => row[2] === "価格提示あなた")?.slice(3), [
    "91",
    "2単位",
  ]);
  assert.doesNotMatch(section, /Call Market|CDA/);
});

test("Call history shows the fourth clearing after automatic period advance, including no-trade results", async () => {
  const session = new DemoSession("call", "buyer", 1000);
  await session.command({ type: "start" }, true);
  await session.command({ type: "call-submit", prices: [123] });
  assert.deepEqual(history(session).rows, []);
  assert.match(history(session).section, /締切後に清算結果/);
  assert.doesNotMatch(history(session).section, /123/);

  for (let call = 1; call <= 3; call++) session.skipStage();
  assert.equal(session.getSnapshot().view.study!.market.call, 4);
  assert.equal(history(session).rows.length, 3);
  session.skipStage();

  const market = session.getSnapshot().view.study!.market;
  assert.equal(market.round, 2);
  assert.equal(market.call, 1);
  assert.ok(
    market.trades.length > 4,
    "the first clearing contains multiple trades",
  );
  const { section, rows } = history(session);
  assert.match(section, /清算回/);
  assert.equal(
    rows.length,
    4,
    "show one summary per clearing, without duplicate unit trades",
  );
  assert.deepEqual(
    rows.map((row) => row[2]),
    ["第4回", "第3回", "第2回", "第1回"],
  );
  assert.ok(rows.every((row) => row[0] === "第1期"));
  assert.equal(rows[0][3], "成立なし");
  assert.equal(rows[0][4], "0単位");
  assert.equal(rows[3][4], `${market.clearings[0].quantity}単位`);
  assert.doesNotMatch(section, /123|買01|売01/);

  for (let call = 0; call < 16; call++) session.skipStage();
  assert.equal(session.getSnapshot().view.study!.market.institution, "cda");
  assert.deepEqual(history(session).rows, []);
  assert.doesNotMatch(history(session).section, /Call Market|成立なし/);
});

test("sellers see Call history in institution-relative periods without the previous institution's trades", async () => {
  const session = new DemoSession("cda", "seller", 1000);
  await session.command({ type: "start" }, true);
  for (let period = 0; period < 5; period++) session.skipStage();
  assert.equal(session.getSnapshot().view.study!.market.round, 6);
  assert.equal(session.getSnapshot().view.study!.market.institution, "call");
  assert.deepEqual(history(session).rows, []);
  session.skipStage();

  const { section, rows } = history(session);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], "第1期");
  assert.equal(rows[0][2], "第1回");
  assert.match(section, /全体の第6期/);
  assert.doesNotMatch(section, /CDA/);

  session.skipStage();
  session.skipStage();
  assert.equal(session.getSnapshot().view.study!.market.call, 4);
  assert.equal(
    await session.command({ type: "call-submit", prices: [1, 1] }),
    true,
  );
  session.skipStage();
  const market = session.getSnapshot().view.study!.market;
  assert.equal(market.round, 7);
  assert.equal(market.call, 1);
  assert.ok(market.clearings.at(-1)!.quantity > 0);
  const latest = history(session).rows[0];
  assert.equal(latest[0], "第1期");
  assert.equal(latest[2], "第4回");
  assert.notEqual(latest[3], "成立なし");
  assert.equal(latest[4], `${market.clearings.at(-1)!.quantity}単位`);
});
