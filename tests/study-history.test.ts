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
