import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyRoom } from "../src/components/study-room";
import { DemoSession } from "../src/lib/demo";
import { studyPeriodTransition } from "../src/lib/study-timing";
import type { Institution } from "../src/lib/study-types";

function fixture(institutions: Institution[], lobby = false) {
  return new DemoSession(institutions[0], "buyer", 1000, {
    lobby,
    config: {
      title: "条件の確認",
      protocol: "institutions-v1",
      markets: 1,
      marketSize: 2,
      capacity: 2,
      rounds: 2,
      duration: 180,
      studyInstitutions: institutions,
      studyPeriods: Object.fromEntries(
        institutions.map((institution) => [
          institution,
          institutions.length === 1 ? 2 : 1,
        ]),
      ),
      studyUnitCounts: { cda: 5, call: 2, posted: 2 },
    },
  });
}

function conditions(session: DemoSession) {
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
    }),
  );
  return html.match(/<aside\b[\s\S]*?<\/aside>/)?.[0] ?? "";
}

for (const institution of ["cda", "call", "posted"] as const)
  test(`${institution} highlights readable, disabled conditions only during the start prompt`, async () => {
    const session = fixture([institution], true);
    assert.equal(
      await session.command(
        { type: "study-randomize", expectedRevision: 0 },
        true,
      ),
      true,
    );
    assert.equal(await session.command({ type: "start" }, true), true);
    const reviewing = conditions(session);
    assert.match(reviewing, /study-conditions-review/);
    assert.match(reviewing, /study-conditions-arrow" aria-hidden="true"/);
    assert.match(reviewing, /あなたの条件/);
    assert.ok(
      [...reviewing.matchAll(/<(?:input|button|select)\b[^>]*>/g)].every(
        ([tag]) => tag.includes("disabled"),
      ),
    );
    await session.command({ type: "pause" }, true);
    session.advanceTime(30);
    assert.match(conditions(session), /study-conditions-review/);
    await session.command({ type: "resume" }, true);
    session.advanceTime(5);
    assert.doesNotMatch(
      conditions(session),
      /study-conditions-review|study-conditions-arrow/,
    );
  });

test("a repeated CDA Start previews the first unit without resetting completed trades or enabling orders", async () => {
  const session = fixture(["cda"]);
  await session.command({ type: "start" }, true);
  for (let unit = 0; unit < 5; unit++) {
    assert.equal(
      await session.command({ type: "study-quote", price: 500 }),
      true,
    );
    session.advanceTime(6);
  }
  assert.equal(session.getSnapshot().view.study!.unitsUsed, 5);
  session.skipStage();
  assert.doesNotMatch(conditions(session), /study-conditions-review/);
  session.advanceTime(3);
  const view = session.getSnapshot().view;
  const fills = view.study!.myTrades.length;
  assert.equal(view.study!.unitsUsed, 5);
  assert.match(conditions(session), /study-conditions-review/);
  assert.match(conditions(session), /1単位目 \/ 5単位/);
  assert.doesNotMatch(conditions(session), /今期の全5単位を購入しました/);
  assert.equal(
    await session.command({ type: "study-quote", price: 100 }),
    false,
  );
  assert.equal(session.getSnapshot().view.study!.unitsUsed, 5);
  assert.equal(session.getSnapshot().view.study!.myTrades.length, fills);
  session.advanceTime(5);
  assert.equal(session.getSnapshot().view.study!.market.round, 2);
  assert.equal(session.getSnapshot().view.study!.unitsUsed, 0);
  assert.doesNotMatch(conditions(session), /study-conditions-review/);
});

test("an institution change previews the upcoming own schedule and unit count", async () => {
  const session = fixture(["cda", "call"]);
  await session.command({ type: "start" }, true);
  session.skipStage();
  assert.equal(session.getSnapshot().view.study!.market.stage, "feedback");
  session.advanceTime(3);
  const view = session.getSnapshot().view;
  assert.equal(view.study!.unitLimits!.length, 5);
  assert.equal(view.study!.nextConditions!.institution, "call");
  assert.equal(view.study!.nextConditions!.unitLimits.length, 2);
  assert.match(conditions(session), /study-conditions-review/);
  assert.match(conditions(session), /1単位目 \/ 2単位/);
  assert.match(conditions(session), /今回の注文を確定/);
  session.advanceTime(5);
  assert.equal(session.getSnapshot().view.study!.market.institution, "call");
  assert.deepEqual(
    session.getSnapshot().view.study!.unitLimits,
    view.study!.nextConditions!.unitLimits,
  );
});

for (const institution of ["call", "posted"] as const)
  test(`${institution} reviews every new period for five shared seconds, including pause and reconnect`, async () => {
    const session = fixture([institution]);
    await session.command({ type: "start" }, true);
    session.advanceTime(3000);
    const { view, now } = session.getSnapshot();
    assert.equal(view.study!.market.round, 1);
    assert.equal(view.study!.market.stage, "feedback");
    assert.equal(view.study!.market.remainingMs, 5000);
    assert.deepEqual(
      studyPeriodTransition(view.config, view.phase, view.study!.market, now),
      { kind: "Start", period: 2, seconds: 5 },
    );
    assert.match(conditions(session), /study-conditions-review/);
    assert.equal(
      await session.command(
        institution === "call"
          ? { type: "call-submit", prices: [100] }
          : { type: "posted-bid", price: 100, quantity: 1 },
      ),
      false,
    );
    await session.command({ type: "pause" }, true);
    session.advanceTime(60);
    const reconnected = structuredClone(session.getSnapshot().view);
    assert.deepEqual(
      studyPeriodTransition(
        reconnected.config,
        reconnected.phase,
        reconnected.study!.market,
        now + 60000,
      ),
      { kind: "Start", period: 2, seconds: 5 },
    );
    await session.command({ type: "resume" }, true);
    session.advanceTime(4);
    assert.equal(session.getSnapshot().view.study!.market.round, 1);
    session.advanceTime(1);
    const next = session.getSnapshot().view.study!.market;
    assert.equal(next.round, 2);
    assert.equal(next.stage, institution === "call" ? "call" : "offer");
    assert.equal(next.remainingMs, institution === "call" ? 30000 : 60000);
    assert.doesNotMatch(conditions(session), /study-conditions-review/);
  });
