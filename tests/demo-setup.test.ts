import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TeacherForm } from "../src/components/teacher-form";
import { DemoEntry } from "../src/components/demo-entry";
import { StudyRoom } from "../src/components/study-room";
import { DemoSession, DEMO_SETTINGS } from "../src/lib/demo";
import { resizeStudySettings, studyTotalRounds } from "../src/lib/study-config";
import { configSchema } from "../src/lib/server/http";
import type { Institution } from "../src/lib/study-types";
import type { RoomConfig } from "../src/lib/types";

function config(institutions: Institution[]): RoomConfig {
  const draft = {
    protocol: "institutions-v1" as const,
    title: "教師設定からのデモ",
    markets: 1,
    marketSize: 6,
    capacity: 6,
    studyInstitutions: institutions,
    studyPeriods: Object.fromEntries(
      institutions.map((i, index) => [i, index + 1]),
    ),
    duration: 4,
    studyTiming: {
      cdaSeconds: 4,
      callSeconds: 2,
      offerSeconds: 2,
      buyerSeconds: 3,
    },
  };
  return { ...draft, rounds: studyTotalRounds(draft) };
}

test("demo starts at the shared teacher settings form and restores the last experiment settings", () => {
  const entry = renderToStaticMarkup(createElement(DemoEntry));
  assert.match(entry, /教員の実験設定/);
  assert.match(entry, /デモルームを作成/);
  assert.match(entry, /実施する制度/);
  assert.doesNotMatch(entry, /ランダムに割り当て<\/button>/);
  const settings = config(["call", "posted"]);
  const markup = renderToStaticMarkup(
    createElement(TeacherForm, {
      status: { mode: "online", ready: false, keyRequired: true },
      initialConfig: settings,
      onCreateDemo: () => {},
    }),
  );
  assert.match(markup, /value="教師設定からのデモ"/);
  assert.match(markup, /value="custom" selected=""/);
  assert.match(markup, /name="studyPeriods.call"[^>]*value="1"/);
  assert.match(markup, /name="studyPeriods.posted"[^>]*value="2"/);
  assert.match(markup, /name="studyTiming.buyerSeconds"[^>]*value="3"/);
  assert.doesNotMatch(markup, /name="password"|name="accessKey"/);
  assert.doesNotMatch(markup, /接続設定が完了していません/);
  assert.doesNotMatch(markup, /name="studyPeriods.cda"/);
  assert.doesNotMatch(markup, /name="studyTiming.cdaSeconds"/);
  assert.doesNotMatch(markup, /<button[^>]*disabled=""/);
  const formal = renderToStaticMarkup(
    createElement(TeacherForm, {
      status: { mode: "local", ready: true, keyRequired: false },
    }),
  );
  assert.match(formal, /name="password"/);
  assert.match(formal, /ルーム管理/);
  assert.match(formal, /実験ルームを作成/);
});

const selections: Institution[][] = [
  ["cda"],
  ["call"],
  ["posted"],
  ["cda", "call"],
  ["cda", "posted"],
  ["call", "posted"],
  ["cda", "call", "posted"],
];
for (const selected of selections) {
  test(`configured demo (${selected.join(" + ")}) honors the lobby, selected periods, clocks and final feedback through completion`, async () => {
    const settings = config(selected);
    const demo = new DemoSession(selected[0], "buyer", 1000, {
      config: settings,
      lobby: true,
      teacher: true,
    });
    let view = demo.getSnapshot().view;
    assert.deepEqual(view.config, settings);
    assert.equal(view.me.role, "teacher");
    assert.equal(view.participantCount, settings.capacity);
    assert.deepEqual(
      view.study!.teacher!.settings,
      resizeStudySettings(DEMO_SETTINGS, settings.marketSize!),
    );
    assert.deepEqual(view.study!.teacher!.markets[0].order, selected);
    assert.equal(await demo.command({ type: "start" }), false);
    assert.equal(
      await demo.command({ type: "study-randomize", expectedRevision: 0 }),
      true,
    );
    const human = demo
      .getSnapshot()
      .view.study!.teacher!.participants.find((p) => p.nickname === "あなた")!;
    demo.toggleTeacher();
    assert.equal(demo.getSnapshot().view.me.id, human.id);
    assert.equal(demo.getSnapshot().view.study!.lobby!.randomizedAt, 1000);
    assert.equal(await demo.command({ type: "start" }, true), true);
    assert.equal(demo.getSnapshot().view.study!.market.stage, "countdown");
    demo.advanceTime(5);
    view = demo.getSnapshot().view;
    assert.equal(view.study!.market.institution, selected[0]);
    const firstSeconds =
      selected[0] === "cda"
        ? settings.studyTiming!.cdaSeconds
        : selected[0] === "call"
          ? settings.studyTiming!.callSeconds
          : settings.studyTiming!.offerSeconds;
    assert.equal(view.study!.market.remainingMs, firstSeconds * 1000);
    const feedback: Institution[] = [];
    for (let i = 0; demo.getSnapshot().view.phase !== "finished"; i++) {
      assert.ok(i < 30, "configured experiment must finish");
      demo.advanceTime(60);
      const market = demo.getSnapshot().view.study!.market;
      if (market.stage === "feedback") {
        feedback.push(market.institution);
        assert.equal(market.remainingMs, 8000);
        demo.advanceTime(7);
        assert.equal(demo.getSnapshot().view.study!.market.stage, "feedback");
        assert.equal(demo.getSnapshot().view.study!.market.remainingMs, 1000);
        demo.advanceTime(1);
      }
    }
    assert.deepEqual(feedback, selected);
    demo.toggleTeacher();
    view = demo.getSnapshot().view;
    assert.equal(view.round, settings.rounds);
    const metrics = view.study!.teacher!.metrics;
    assert.equal(metrics.length, settings.rounds);
    for (const institution of selected)
      assert.equal(
        metrics.filter((m) => m.institution === institution).length,
        settings.studyPeriods![institution],
      );
    assert.ok(metrics.every((m) => m.completion === "complete"));
    assert.ok(
      view.study!.teacher!.markets[0].trades.every(
        (t) => t.buyerId !== human.id && t.sellerId !== human.id,
      ),
    );
    demo.reset();
    assert.deepEqual(demo.getSnapshot().view.config, settings);
    assert.equal(demo.getSnapshot().view.phase, "waiting");
    assert.equal(demo.getSnapshot().view.study!.lobby!.randomizedAt, null);
  });
}

test("configured multi-market demo fills the chosen seats, balances selected orders and permits settings edits only before starting", async () => {
  const settings = {
    ...config(["call", "posted"]),
    markets: 6,
    marketSize: 4,
    capacity: 24,
  };
  const demo = new DemoSession("call", "buyer", 1000, {
    config: settings,
    lobby: true,
    teacher: true,
  });
  const teacher = demo.getSnapshot().view.study!.teacher!;
  assert.equal(teacher.markets.length, 6);
  assert.equal(teacher.participants.length, 24);
  assert.equal(teacher.markets.filter((m) => m.order[0] === "call").length, 3);
  for (const market of teacher.markets) {
    const people = teacher.participants.filter((p) => p.market === market.id);
    assert.equal(people.filter((p) => p.role === "buyer").length, 2);
    assert.equal(people.filter((p) => p.role === "seller").length, 2);
  }
  const timing = { ...settings.studyTiming!, callSeconds: 7 };
  assert.equal(
    await demo.command({ type: "study-timing", expectedRevision: 0, timing }),
    true,
  );
  assert.deepEqual(demo.getSnapshot().view.config.studyTiming, timing);
  const editedSettings = {
    values: [
      [180, 160],
      [140, 120],
    ],
    costs: [
      [30, 50],
      [60, 80],
    ],
  } satisfies typeof DEMO_SETTINGS;
  assert.equal(
    await demo.command({
      type: "study-settings",
      expectedRevision: 1,
      settings: editedSettings,
    }),
    true,
  );
  assert.deepEqual(
    demo.getSnapshot().view.study!.teacher!.settings,
    editedSettings,
  );
  const markup = renderToStaticMarkup(
    createElement(StudyRoom, {
      view: demo.getSnapshot().view,
      now: demo.getSnapshot().now,
      command: demo.command,
      disabled: false,
      connected: true,
      error: "",
      notice: "",
      retry: () => {},
      demo: true,
    }),
  );
  assert.match(markup, /供需条件・Commissionを変更/);
  assert.equal(
    await demo.command({ type: "study-randomize", expectedRevision: 0 }),
    true,
  );
  assert.equal(await demo.command({ type: "start" }), true);
  assert.equal(
    await demo.command({
      type: "study-timing",
      expectedRevision: 2,
      timing: settings.studyTiming!,
    }),
    false,
  );
  assert.deepEqual(demo.getSnapshot().view.config.studyTiming, timing);
});

test("configured demos reject the same invalid room settings as formal creation", () => {
  const settings = config(["call", "posted"]);
  for (const invalid of [
    { ...settings, title: " " },
    { ...settings, studyInstitutions: [] },
    { ...settings, studyPeriods: { call: 21, posted: 2 }, rounds: 23 },
    { ...settings, rounds: 15 },
    { ...settings, marketSize: 3 },
    { ...settings, capacity: 192, markets: 96, marketSize: 4 },
    { ...settings, studyTiming: { ...settings.studyTiming, buyerSeconds: 0 } },
  ]) {
    assert.equal(configSchema.safeParse(invalid).success, false);
    assert.throws(
      () =>
        new DemoSession("call", "buyer", 1000, {
          config: invalid as RoomConfig,
        }),
    );
  }
});

test("Posted demo supports purchase queues larger than the original eight buyers", async () => {
  const settings = {
    ...config(["posted"]),
    marketSize: 64,
    capacity: 64,
  };
  const demo = new DemoSession("posted", "buyer", 1000, { config: settings });
  assert.equal(await demo.command({ type: "start" }, true), true);
  demo.skipToHuman();
  const view = demo.getSnapshot().view;
  assert.equal(view.study!.market.activeBuyer, view.me.alias);
  assert.equal(view.study!.market.remainingMs, 3000);
  assert.equal(view.study!.unitsUsed, 0);
  assert.ok(view.study!.market.offers.some((offer) => offer.remaining > 0));
});
