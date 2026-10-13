import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyTradeFeedback } from "../src/components/study-personal-trades";
import { StudyRoom } from "../src/components/study-room";
import { DemoSession } from "../src/lib/demo";
import type { StudyView } from "../src/lib/study-types";

test("final-period feedback shows only that period's fills, including losses, for both sides", () => {
  const trades: StudyView["myTrades"] = [
    {
      id: "previous",
      round: 4,
      institution: "call",
      price: 333,
      unit: 1,
      profit: 40,
    },
    {
      id: "final-one",
      round: 5,
      institution: "call",
      price: 100,
      unit: 1,
      profit: -10,
    },
    {
      id: "final-two",
      round: 5,
      institution: "call",
      price: 100,
      unit: 2,
      profit: 5,
    },
  ];
  for (const buyer of [true, false]) {
    const html = renderToStaticMarkup(
      createElement(StudyTradeFeedback, { trades, buyer, feedbackRound: 5 }),
    );
    assert.match(html, /第5期の取引結果：取引が成立しました/);
    assert.match(html, new RegExp(`2単位を100 円で${buyer ? "購入" : "販売"}`));
    assert.match(html, /利益 -5 円（損失）/);
    assert.doesNotMatch(html, /333|取引通知を閉じる/);
  }
});

test("students with no final-period fills receive unfilled feedback even if they traded earlier", () => {
  const html = renderToStaticMarkup(
    createElement(StudyTradeFeedback, {
      trades: [
        {
          id: "old",
          round: 9,
          institution: "posted",
          price: 222,
          unit: 1,
          profit: 20,
        },
      ],
      buyer: true,
      feedbackRound: 10,
      feedbackPeriod: 5,
    }),
  );
  assert.match(html, /第5期の取引結果：未約定/);
  assert.match(html, /今期は取引が成立しませんでした。/);
  assert.match(html, /利益 0 円/);
  assert.doesNotMatch(html, /222|取引通知を閉じる/);
});

test("the demo renders unfilled feedback, blocks stage skipping and switches at the shared eight-second deadline", async () => {
  const session = new DemoSession("cda", "buyer", 1000);
  await session.command({ type: "start" }, true);
  for (let period = 0; period < 5; period++) {
    session.skipStage();
    if (period < 4) session.advanceTime(8);
  }
  const state = session.getSnapshot();
  assert.equal(state.view.study!.market.stage, "feedback");
  assert.equal(state.view.study!.market.round, 5);
  const html = renderToStaticMarkup(
    createElement(StudyRoom, {
      view: state.view,
      now: state.now,
      command: session.command,
      disabled: false,
      connected: true,
      error: "",
      notice: "",
      retry: () => {},
      demo: true,
    }),
  );
  assert.match(html, /第5期の取引結果：未約定/);
  assert.match(html, /次の取引開始まで/);
  assert.match(html, /00:08/);
  assert.equal(
    await session.command({ type: "study-quote", price: 100 }),
    false,
  );
  session.skipStage();
  assert.equal(session.getSnapshot().now, state.now);
  for (let second = 0; second < 7; second++) session.tick(1000);
  assert.equal(session.getSnapshot().view.study!.market.stage, "feedback");
  session.tick(1000);
  assert.equal(session.getSnapshot().view.study!.market.round, 6);
  assert.equal(session.getSnapshot().view.study!.market.institution, "call");
});

test("demo fast-forward stops at a new feedback stage without consuming its eight seconds", async () => {
  for (const first of ["cda", "call", "posted"] as const) {
    const session = new DemoSession(first, "seller", 1000);
    await session.command({ type: "start" }, true);
    session.advanceTime(3000);
    const state = session.getSnapshot();
    assert.equal(state.view.study!.market.round, first === "cda" ? 1 : 5);
    assert.equal(state.view.study!.market.stage, "feedback");
    assert.equal(state.view.study!.market.remainingMs, 8000);
    assert.equal(state.view.study!.market.deadline, state.now + 8000);
  }
});

test("skipping a Posted stage stops when bot purchases finish the last period early", async () => {
  const session = new DemoSession("posted", "seller", 1000);
  await session.command({ type: "start" }, true);
  for (let step = 0; step < 450; step++) {
    if (session.getSnapshot().view.study!.market.stage === "feedback") break;
    session.skipStage();
  }
  const state = session.getSnapshot();
  assert.equal(state.view.study!.market.stage, "feedback");
  assert.equal(state.view.study!.market.round, 5);
  assert.equal(state.view.study!.market.remainingMs, 8000);
  assert.equal(state.view.study!.market.deadline, state.now + 8000);
});
