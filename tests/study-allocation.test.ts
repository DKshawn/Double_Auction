import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PGlite } from "@electric-sql/pglite";
import {
  studyAllocationPlan,
  studyAllocationWaitingMessage,
} from "../src/lib/study-allocation";
import { DemoSession, DEMO_SETTINGS } from "../src/lib/demo";
import { resizeStudySettings } from "../src/lib/study-config";
import { generatedStudySettings } from "../src/lib/study-generator";
import { studyRoomConfigSchema } from "../src/lib/study-room-config";
import { studyChartViewport } from "../src/lib/study-chart";
import { StudyAllocationPreview } from "../src/components/study-allocation-preview";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { studyEquilibrium } from "../src/lib/study-view";
import { equilibrium } from "../src/lib/equilibrium";
import type { Command, RoomConfig } from "../src/lib/types";
import type { StudyGeneratorConfig } from "../src/lib/study-types";

const generator: StudyGeneratorConfig = {
  kind: "overlap-staircase",
  parameters: { p: 80, K: 2, L: 2, d: 4 },
  seed: 123456,
};
function config(
  attendance: number,
  markets: number,
  mode: "auto" | "manual" = "manual",
  units = 2,
): RoomConfig {
  const plan = studyAllocationPlan(attendance, markets, mode);
  return {
    protocol: "institutions-v1",
    studyAdmission: "flexible",
    studyMarketMode: mode,
    title: "Largest market template",
    markets: plan.requestedMarkets,
    marketSize: plan.templateSize,
    capacity: attendance,
    rounds: 3,
    duration: 2,
    studyInstitutions: ["cda", "call", "posted"],
    studyPeriods: { cda: 1, call: 1, posted: 1 },
    studyCdaUnits: units,
    studyCommission: 0,
    studyTiming: {
      cdaSeconds: 2,
      callSeconds: 2,
      offerSeconds: 2,
      buyerSeconds: 2,
      purchaseSeconds: 2,
    },
  };
}
function demo(
  attendance: number,
  markets: number,
  mode: "auto" | "manual" = "manual",
  units = 2,
  custom: StudyGeneratorConfig | undefined = generator,
) {
  return new DemoSession("cda", "buyer", 1000, {
    config: config(attendance, markets, mode, units),
    generator: custom,
    lobby: true,
    teacher: true,
  });
}
async function admission(
  session: DemoSession,
  action: Extract<Command, { type: "study-admission" }>["action"],
  extra: {
    markets?: number;
    marketMode?: "auto" | "manual";
    seconds?: number;
  } = {},
) {
  assert.equal(
    await session.command({
      type: "study-admission",
      action,
      expectedRevision: session.getSnapshot().view.study!.lobby!.revision,
      ...extra,
    }),
    true,
    session.getSnapshot().error,
  );
}

test("manual markets stay balanced while automatic markets fill 16 people in sequence and use the largest even template", () => {
  for (let attendance = 2; attendance <= 999; attendance++)
    for (const requested of [1, 2, 4, 12, 96, 499]) {
      const plan = studyAllocationPlan(attendance, requested);
      assert.equal(
        plan.layout.length,
        Math.min(requested, Math.floor(attendance / 2)),
      );
      const sizes = plan.layout.map((m) => m.buyers + m.sellers);
      assert.equal(
        sizes.reduce((sum, n) => sum + n, 0),
        attendance,
      );
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
      assert.equal(plan.templateSize, Math.ceil(Math.max(...sizes) / 2) * 2);
      assert.ok(
        plan.layout.every(
          (m) =>
            m.buyers >= 1 &&
            m.sellers >= 1 &&
            Math.abs(m.buyers - m.sellers) <= 1,
        ),
      );
    }
  assert.deepEqual(studyAllocationPlan(17, 4).layout, [
    { buyers: 3, sellers: 2 },
    { buyers: 2, sellers: 2 },
    { buyers: 2, sellers: 2 },
    { buyers: 2, sellers: 2 },
  ]);
  assert.equal(studyAllocationPlan(17, 4).templateSize, 6);
  for (let count = 1; count <= 999; count++) {
    const plan = studyAllocationPlan(count, 96, "auto");
    assert.equal(plan.layout.length, Math.ceil(count / 16));
    const sizes = plan.layout.map((m) => m.buyers + m.sellers);
    assert.deepEqual(
      sizes,
      Array.from({ length: Math.ceil(count / 16) }, (_, i) =>
        Math.min(16, count - i * 16),
      ),
    );
    assert.equal(plan.templateSize, Math.ceil(Math.max(...sizes) / 2) * 2);
    assert.equal(!!studyAllocationWaitingMessage(plan), count % 16 === 1);
  }
  assert.deepEqual(
    studyAllocationPlan(17, 4, "auto").layout.map((m) => m.buyers + m.sellers),
    [16, 1],
  );
  assert.deepEqual(
    studyAllocationPlan(33, 4, "auto").layout.map((m) => m.buyers + m.sellers),
    [16, 16, 1],
  );
  assert.ok(studyRoomConfigSchema.safeParse(config(17, 4)).success);
});

test("automatic 16-person grouping and an explicit manual market count use the same live plan and manual selection persists", async () => {
  const session = demo(17, 1, "auto");
  let view = session.getSnapshot().view;
  assert.equal(view.study!.teacher!.allocation!.layout.length, 2);
  assert.equal(view.study!.teacher!.allocation!.templateSize, 16);
  await admission(session, "configure", { markets: 4 });
  view = session.getSnapshot().view;
  assert.equal(view.config.studyMarketMode, "manual");
  assert.equal(view.study!.teacher!.allocation!.templateSize, 6);
  await admission(session, "close");
  view = session.getSnapshot().view;
  assert.deepEqual(
    view.config.studyLayout!.map((m) => m.buyers + m.sellers),
    [5, 4, 4, 4],
  );
  assert.equal(view.config.marketSize, 6);
  assert.deepEqual(
    view.study!.teacher!.settings,
    generatedStudySettings(generator, 6),
  );
  const saved = structuredClone(view.study!.teacher!.generation!.assignments);
  await admission(session, "open");
  await admission(session, "close");
  assert.deepEqual(
    session.getSnapshot().view.study!.teacher!.generation!.assignments,
    saved,
  );
  await admission(session, "open");
  await admission(session, "configure", { marketMode: "auto" });
  assert.equal(
    session.getSnapshot().view.study!.teacher!.allocation!.layout.length,
    2,
  );
  await admission(session, "close");
  view = session.getSnapshot().view;
  assert.equal(view.study!.lobby!.admission!.status, "open");
  assert.equal(view.study!.lobby!.randomizedAt, null);
  assert.equal(view.study!.teacher!.allocation!.templateSize, 16);
  assert.deepEqual(
    view.study!.teacher!.allocation!.layout.map((m) => m.buyers + m.sellers),
    [16, 1],
  );
  assert.equal(view.study!.teacher!.generation!.assignments.length, 0);
});

test("a singleton automatic market keeps admission open after the deadline and cannot start, while 16 plus 2 can start", async () => {
  const session = demo(17, 1, "auto");
  const plan = session.getSnapshot().view.study!.teacher!.allocation!;
  const markup = renderToStaticMarkup(
    createElement(StudyAllocationPreview, {
      plan,
      config: config(17, 1, "auto"),
      settings: generatedStudySettings(generator, 16),
      commission: 0,
    }),
  );
  assert.match(markup, /最大市場16人.*供需テンプレート16人/s);
  assert.match(markup, /2（補充待ち）/);
  assert.doesNotMatch(markup, /Infinity|NaN|市場2・/);
  await admission(session, "schedule", { seconds: 5 });
  for (let i = 0; i < 5; i++) session.tick(1000);
  const view = session.getSnapshot().view;
  assert.equal(view.study!.lobby!.admission!.status, "open");
  assert.equal(view.study!.lobby!.admission!.closesAt, null);
  assert.equal(view.study!.lobby!.admission!.closedAt, null);
  assert.equal(view.study!.lobby!.randomizedAt, null);
  assert.equal(view.study!.teacher!.generation!.assignmentConfirmedAt, null);
  assert.equal(view.study!.teacher!.generation!.assignments.length, 0);
  assert.equal(await session.command({ type: "start" }), false);
  assert.match(session.getSnapshot().error, /市場2は1人のため補充待ち/);

  const ready = demo(18, 1, "auto");
  await admission(ready, "close");
  const assigned = ready.getSnapshot().view;
  assert.deepEqual(assigned.config.studyLayout, [
    { buyers: 8, sellers: 8 },
    { buyers: 1, sellers: 1 },
  ]);
  assert.equal(assigned.config.marketSize, 16);
  assert.equal(assigned.study!.teacher!.generation!.assignments.length, 18);
  assert.equal(await ready.command({ type: "start" }), true);
});

test("invalid K and L survive market resizing unchanged; a persisted cutoff blocks start until both CDA and the two-unit schedules are reconfigured", async () => {
  const original = { ...generator, parameters: { p: 200, K: 8, L: 4, d: 4 } };
  const session = demo(32, 2, "auto", 5, original);
  await admission(session, "configure", { markets: 4 });
  assert.match(
    session.getSnapshot().view.study!.teacher!.allocation!.error!,
    /K＋L.*8/s,
  );
  await admission(session, "schedule", { seconds: 5 });
  for (let i = 0; i < 5; i++) session.tick(1000);
  let view = session.getSnapshot().view;
  assert.equal(view.study!.lobby!.admission!.status, "closed");
  assert.match(view.study!.lobby!.admission!.error!, /K=8、L=4/);
  assert.equal(view.study!.lobby!.randomizedAt, null);
  assert.deepEqual(
    session.getGeneratorConfig()!.parameters,
    original.parameters,
  );
  assert.equal(view.study!.teacher!.generation!.assignments.length, 0);
  assert.equal(await session.command({ type: "start" }), false);
  assert.match(session.getSnapshot().error, /K＋L/);
  session.toggleTeacher();
  const student = session.getSnapshot().view;
  assert.equal(
    student.study!.lobby!.admission!.error,
    "教員による条件の確認をお待ちください。",
  );
  assert.doesNotMatch(JSON.stringify(student), /K=8|L=4|パラメータ/);
  session.toggleTeacher();
  const fixed = {
    ...original,
    parameters: { ...original.parameters, K: 2, L: 2 },
  };
  assert.equal(
    await session.command({
      type: "study-settings",
      settings: generatedStudySettings(fixed, 20, 5),
      generator: fixed,
      unitsPerParticipant: 5,
      commission: 0,
      expectedRevision: view.study!.settingsRevision,
    }),
    true,
    session.getSnapshot().error,
  );
  await admission(session, "close");
  view = session.getSnapshot().view;
  assert.equal(view.config.marketSize, 8);
  assert.deepEqual(
    view.study!.teacher!.otherSettings,
    generatedStudySettings(fixed, 8),
  );
  assert.equal(view.study!.teacher!.generation!.assignments.length, 32);
  assert.equal(await session.command({ type: "start" }), true);
  const conditions = JSON.stringify(view.study!.teacher!.settings);
  assert.equal(await session.command({ type: "pause" }), true);
  assert.equal(
    await session.command({
      type: "study-settings",
      settings: generatedStudySettings(fixed, 20, 5),
      generator: fixed,
      expectedRevision: view.study!.settingsRevision,
    }),
    false,
  );
  assert.equal(
    JSON.stringify(session.getSnapshot().view.study!.teacher!.settings),
    conditions,
  );
});

test("Default returns to the source schedule after shrinking and expanding markets instead of repeatedly resampling reduced profiles", async () => {
  const plain = new DemoSession("cda", "buyer", 1000, {
    config: config(32, 1),
    lobby: true,
    teacher: true,
  });
  await admission(plain, "configure", { markets: 4 });
  await admission(plain, "close");
  assert.deepEqual(
    plain.getSnapshot().view.study!.teacher!.settings,
    resizeStudySettings(DEMO_SETTINGS, 8),
  );
  await admission(plain, "open");
  await admission(plain, "configure", { markets: 1 });
  await admission(plain, "close");
  assert.deepEqual(
    plain.getSnapshot().view.study!.teacher!.settings,
    resizeStudySettings(DEMO_SETTINGS, 32),
  );
});

test("actual previews, asymmetric unit tables and all three institutions' metrics use the conditions assigned to each market", async () => {
  const session = demo(17, 4);
  const planned = session.getSnapshot().view.study!.teacher!.allocation!;
  const markup = renderToStaticMarkup(
    createElement(StudyAllocationPreview, {
      plan: planned,
      config: config(17, 4),
      settings: generatedStudySettings(generator, 6),
      commission: 0,
    }),
  );
  assert.match(markup, /最大市場5人.*供需テンプレート6人/s);
  assert.match(markup, /買6・売4単位/);
  assert.match(markup, /20円/);
  assert.match(markup, /16円/);
  assert.equal(studyChartViewport([100, 90], [60, 70, 80]).count, 3);
  await admission(session, "close");
  let view = session.getSnapshot().view;
  assert.equal(view.study!.teacher!.marketEquilibria![1].cda.surplus, 20);
  assert.equal(view.study!.teacher!.marketEquilibria![2].cda.surplus, 16);
  assert.equal(await session.command({ type: "start" }), true);
  for (let i = 0; session.getSnapshot().view.phase !== "finished"; i++) {
    assert.ok(i < 30);
    session.advanceTime(60);
  }
  view = session.getSnapshot().view;
  assert.equal(view.study!.teacher!.metrics.length, 12);
  assert.ok(
    view.study!.teacher!.metrics.every(
      (m) =>
        m.completion === "complete" &&
        (m.efficiency === null || Number.isFinite(m.efficiency)),
    ),
  );
});

test("local persistence keeps manual grouping as students arrive and exports the actual market conditions and benchmarks", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    let service = new AuctionService(db);
    const teacher = await service.create(
      config(16, 1, "auto"),
      "Local-Only-Grouping",
      "",
      generator,
    );
    for (let i = 0; i < 17; i++)
      await service.join(teacher.code, String(1000000 + i), "1234");
    const send = async (command: Command) => {
      const view = await service.view(teacher.code, teacher.token);
      await service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        command,
      });
    };
    let view = await service.view(teacher.code, teacher.token);
    assert.equal(view.study!.teacher!.allocation!.layout.length, 2);
    assert.deepEqual(
      view.study!.teacher!.allocation!.layout.map((m) => m.buyers + m.sellers),
      [16, 1],
    );
    await send({
      type: "study-admission",
      action: "configure",
      markets: 4,
      expectedRevision: view.study!.lobby!.revision,
    });
    await service.join(teacher.code, "1000017", "1234");
    service = new AuctionService(db);
    view = await service.view(teacher.code, teacher.token);
    assert.equal(view.config.studyMarketMode, "manual");
    assert.equal(view.study!.teacher!.allocation!.layout.length, 4);
    assert.deepEqual(
      view.study!.teacher!.allocation!.layout.map((m) => m.buyers + m.sellers),
      [5, 5, 4, 4],
    );
    await send({
      type: "study-admission",
      action: "close",
      expectedRevision: view.study!.lobby!.revision,
    });
    const saved = await service.export(teacher.code, teacher.token);
    assert.equal(saved.room.config.marketSize, 6);
    assert.equal(saved.room.study!.settings.values.length, 3);
    for (const market of saved.room.study!.markets) {
      const assignments = saved.room.study!.generation!.assignments.filter(
        (a) => a.market === market.id,
      );
      const values = assignments
        .filter((a) => a.role === "buyer")
        .flatMap((a) => a.limits);
      const costs = assignments
        .filter((a) => a.role === "seller")
        .flatMap((a) => a.limits);
      assert.deepEqual(
        studyEquilibrium(saved.room, "cda", market.id),
        equilibrium(values, costs),
      );
    }
  } finally {
    await pg.close();
  }
});

test("local automatic admission persists the singleton wait, accepts the next student, and then assigns 16 plus 2 with the same template", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    let service = new AuctionService(db);
    const teacher = await service.create(
      config(16, 1, "auto"),
      "Local-Only-Sequential",
      "",
      generator,
    );
    for (let i = 0; i < 17; i++)
      await service.join(teacher.code, String(2000000 + i), "1234");
    const send = async (command: Command) => {
      const view = await service.view(teacher.code, teacher.token);
      await service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        command,
      });
    };
    let view = await service.view(teacher.code, teacher.token);
    await send({
      type: "study-admission",
      action: "close",
      expectedRevision: view.study!.lobby!.revision,
    });
    service = new AuctionService(db);
    view = await service.view(teacher.code, teacher.token);
    assert.equal(view.config.studyMarketMode, "auto");
    assert.equal(view.study!.lobby!.admission!.status, "open");
    assert.equal(view.study!.lobby!.randomizedAt, null);
    assert.equal(view.study!.teacher!.allocation!.templateSize, 16);
    assert.match(
      studyAllocationWaitingMessage(view.study!.teacher!.allocation!),
      /市場2は1人/,
    );
    await assert.rejects(send({ type: "start" }), /補充待ち/);
    const student = await service.join(teacher.code, "2000017", "1234");
    view = await service.view(teacher.code, teacher.token);
    assert.equal(
      studyAllocationWaitingMessage(view.study!.teacher!.allocation!),
      "",
    );
    assert.equal(
      (await service.view(teacher.code, student.token)).study!.unitLimits,
      null,
    );
    await send({
      type: "study-admission",
      action: "close",
      expectedRevision: view.study!.lobby!.revision,
    });
    const saved = await service.export(teacher.code, teacher.token);
    assert.equal(saved.room.config.marketSize, 16);
    assert.deepEqual(saved.room.config.studyLayout, [
      { buyers: 8, sellers: 8 },
      { buyers: 1, sellers: 1 },
    ]);
    assert.deepEqual(
      saved.room.study!.settings,
      generatedStudySettings(generator, 16),
    );
    assert.equal(saved.room.study!.generation!.assignments.length, 18);
    await send({ type: "start" });
    view = await service.view(teacher.code, teacher.token);
    assert.equal(view.phase, "running");
    assert.ok(
      view.study!.teacher!.markets.every((m) => m.stage === "countdown"),
    );
    assert.ok(
      Object.values(view.study!.teacher!.marketEquilibria!).every((m) =>
        Object.values(m).every((eq) =>
          [eq.low, eq.high, eq.quantity, eq.quantityMax, eq.surplus].every(
            Number.isFinite,
          ),
        ),
      ),
    );
  } finally {
    await pg.close();
  }
});
