import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PGlite } from "@electric-sql/pglite";
import {
  studyCommissionLimit,
  studyCommissionError,
  studyCommissionEquilibrium,
} from "../src/lib/study-commission";
import {
  generateStaircase,
  DEFAULT_STAIRCASE_PARAMETERS,
} from "../src/lib/study-generator";
import { pptStudySettings } from "../src/lib/server/study";
import { DemoSession } from "../src/lib/demo";
import { StudyConditionPreview } from "../src/components/study-condition-preview";
import { StudyPresetPicker } from "../src/components/study-preset-picker";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { commandSchema } from "../src/lib/server/http";
import { randomUUID } from "node:crypto";
import type { RoomConfig } from "../src/lib/types";
import type {
  StudySettings,
  StudyGeneratorConfig,
} from "../src/lib/study-types";

const config: RoomConfig = {
  protocol: "institutions-v1",
  title: "Commission上限のテスト",
  markets: 1,
  marketSize: 16,
  capacity: 16,
  rounds: 1,
  duration: 180,
  studyInstitutions: ["cda"],
  studyPeriods: { cda: 1 },
  studyCommission: 3,
};
const generator = (d = 4): StudyGeneratorConfig => ({
  kind: "overlap-staircase",
  parameters: { ...DEFAULT_STAIRCASE_PARAMETERS, d },
  seed: 123,
});

test("both-party rewards must keep every originally negative marginal trade strictly negative", () => {
  const g = generateStaircase(DEFAULT_STAIRCASE_PARAMETERS);
  assert.deepEqual(studyCommissionLimit(g.settings), {
    maximum: 3,
    firstNegativeUnit: 13,
    gap: 8,
  });
  for (const amount of [0, 1, 2, 3]) {
    assert.equal(studyCommissionError(amount, g.settings), "");
    for (let i = 12; i < 16; i++)
      assert.ok(g.demand[i] - g.supply[i] + 2 * amount < 0);
  }
  for (const amount of [4, 5, 999])
    assert.match(
      studyCommissionError(amount, g.settings),
      /0〜3円.*第13単位.*8円/,
    );
  assert.equal(
    g.demand[12] - g.supply[12] + 2 * 4,
    0,
    "zero is also rejected at the boundary",
  );
  assert.equal(g.demand[12] - g.supply[12] + 2 * 5, 2);
  assert.deepEqual(studyCommissionLimit(pptStudySettings()), {
    maximum: 3,
    firstNegativeUnit: 12,
    gap: 8,
  });
});

test("limits are derived from current sorted values and costs, including odd and very small gaps", () => {
  for (const gap of [1, 2, 3, 4, 5, 7, 8, 10]) {
    const settings: StudySettings = {
      values: [[80, 40]],
      costs: [[20, 40 + gap]],
    };
    const before = structuredClone(settings);
    const maximum = Math.ceil(gap / 2) - 1;
    assert.equal(studyCommissionLimit(settings).maximum, maximum);
    assert.equal(studyCommissionError(maximum, settings), "");
    assert.notEqual(studyCommissionError(maximum + 1, settings), "");
    assert.deepEqual(settings, before);
  }
  assert.equal(
    studyCommissionLimit(
      generateStaircase({ ...DEFAULT_STAIRCASE_PARAMETERS, d: 1 }).settings,
    ).maximum,
    0,
  );
  assert.equal(
    studyCommissionLimit(
      generateStaircase({ ...DEFAULT_STAIRCASE_PARAMETERS, d: 6 }).settings,
    ).maximum,
    5,
  );
  const noNegative = generateStaircase({
    ...DEFAULT_STAIRCASE_PARAMETERS,
    L: 8,
  }).settings;
  assert.deepEqual(studyCommissionLimit(noNegative), {
    maximum: 999,
    firstNegativeUnit: null,
    gap: null,
  });
  assert.equal(studyCommissionError(999, noNegative), "");
  assert.notEqual(studyCommissionError(1000, noNegative), "");
});

test("the rewarded equilibrium updates independently of the original theoretical benchmark", () => {
  const g = generateStaircase(DEFAULT_STAIRCASE_PARAMETERS);
  assert.deepEqual(studyCommissionEquilibrium(g.settings, 0), {
    low: 80,
    high: 80,
    quantity: 8,
    quantityMax: 12,
    surplus: 288,
  });
  assert.deepEqual(studyCommissionEquilibrium(g.settings, 1), {
    low: 79,
    high: 81,
    quantity: 12,
    quantityMax: 12,
    surplus: 312,
  });
  assert.deepEqual(studyCommissionEquilibrium(g.settings, 2), {
    low: 78,
    high: 82,
    quantity: 12,
    quantityMax: 12,
    surplus: 336,
  });
  assert.deepEqual(g.equilibrium, {
    low: 80,
    high: 80,
    quantity: 8,
    quantityMax: 12,
    surplus: 288,
  });
  const markup = renderToStaticMarkup(
    createElement(StudyConditionPreview, {
      settings: g.settings,
      commission: 2,
    }),
  );
  assert.match(markup, /原始供需（Commissionなし）/);
  assert.match(markup, /Commission込み（各2円／単位）/);
  assert.match(markup, /78〜82 円/);
  assert.match(markup, /8〜12 単位/);
  assert.match(markup, /288 円/);
});

test("the default picker keeps one bounded commission input and hides custom details", () => {
  const markup = renderToStaticMarkup(
    createElement(StudyPresetPicker, {
      units: 16,
      disabled: false,
      commission: 1,
      onCommissionChange: () => {},
      onConfirm: () => true,
      actionLabel: "設定を保存して閉じる",
      existingPreset: { label: "Default", settings: pptStudySettings() },
      settingsPanel: {
        heading: "供需プリセット",
        labelledBy: "condition-heading",
      },
    }),
  );
  const input =
    markup.match(/<input[^>]*name="studyCommission"[^>]*>/)?.[0] ?? "";
  assert.match(input, /max="3"/);
  assert.match(input, /value="1"/);
  assert.match(markup, /Default/);
  assert.doesNotMatch(markup, /既存 PPT プリセット/);
  assert.equal((markup.match(/name="studyCommission"/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /study-generated-preview|teacher-units-panel/);
  assert.doesNotMatch(markup, /均衡価格 p|割当シード/);
  assert.match(
    markup,
    /<button(?![^>]*disabled)[^>]*>設定を保存して閉じる<\/button>/,
  );
});

test("the demo rejects an unsafe initial reward and saves new conditions with commission atomically", async () => {
  assert.throws(
    () =>
      new DemoSession("cda", "buyer", 1000, {
        config: { ...config, studyCommission: 4 },
        generator: generator(),
        lobby: true,
        teacher: true,
      }),
    /0〜3円/,
  );
  const demo = new DemoSession("cda", "buyer", 1000, {
    config,
    generator: generator(),
    lobby: true,
    teacher: true,
  });
  const before = demo.getSnapshot().view;
  const revision = before.study!.settingsRevision;
  assert.equal(
    await demo.command({
      type: "study-commission",
      commission: 4,
      expectedRevision: revision,
    }),
    false,
  );
  assert.equal(demo.getSnapshot().view.config.studyCommission, 3);
  const finer = generateStaircase({
    ...DEFAULT_STAIRCASE_PARAMETERS,
    d: 1,
  }).settings;
  assert.equal(
    await demo.command({
      type: "study-settings",
      settings: finer,
      generator: generator(1),
      expectedRevision: revision,
    }),
    false,
  );
  assert.deepEqual(
    demo.getSnapshot().view.study!.teacher!.settings,
    before.study!.teacher!.settings,
  );
  assert.equal(demo.getSnapshot().view.study!.settingsRevision, revision);
  assert.equal(
    await demo.command({
      type: "study-settings",
      settings: finer,
      generator: generator(1),
      commission: 0,
      expectedRevision: revision,
    }),
    true,
  );
  let view = demo.getSnapshot().view;
  assert.equal(view.config.studyCommission, 0);
  assert.deepEqual(view.study!.teacher!.settings, finer);
  assert.equal(
    await demo.command({
      type: "study-commission",
      commission: 1,
      expectedRevision: view.study!.settingsRevision,
    }),
    false,
  );
  assert.equal(
    await demo.command({
      type: "study-commission",
      commission: 0,
      expectedRevision: revision,
    }),
    false,
    "stale revision still rejected",
  );
  assert.equal(
    await demo.command({
      type: "study-settings",
      settings: generateStaircase(DEFAULT_STAIRCASE_PARAMETERS).settings,
      generator: generator(),
      commission: 3,
      expectedRevision: view.study!.settingsRevision,
    }),
    true,
  );
  view = demo.getSnapshot().view;
  assert.equal(
    await demo.command({
      type: "study-randomize",
      expectedRevision: view.study!.lobby!.revision,
    }),
    true,
  );
  assert.equal(await demo.command({ type: "start" }), true);
  view = demo.getSnapshot().view;
  assert.equal(
    await demo.command({
      type: "study-settings",
      settings: finer,
      commission: 0,
      expectedRevision: view.study!.settingsRevision,
    }),
    false,
  );
  assert.equal(
    await demo.command({
      type: "study-commission",
      commission: 0,
      expectedRevision: view.study!.settingsRevision,
    }),
    false,
  );
  assert.equal(demo.getSnapshot().view.config.studyCommission, 3);
});

test("manual schedules cannot bypass the marginal loss bound", async () => {
  const demo = new DemoSession("cda", "buyer", 1000, {
    config,
    lobby: true,
    teacher: true,
  });
  const settings = structuredClone(
    demo.getSnapshot().view.study!.teacher!.settings,
  );
  settings.values = Array.from({ length: 8 }, () => [80, 40]);
  settings.costs = Array.from({ length: 8 }, () => [20, 41]);
  const revision = demo.getSnapshot().view.study!.settingsRevision;
  assert.equal(
    await demo.command({
      type: "study-settings",
      settings,
      expectedRevision: revision,
    }),
    false,
  );
  assert.equal(
    await demo.command({
      type: "study-settings",
      settings,
      commission: 0,
      expectedRevision: revision,
    }),
    true,
  );
  assert.equal(demo.getSnapshot().view.config.studyCommission, 0);
  assert.deepEqual(demo.getSnapshot().view.study!.teacher!.settings, settings);
});

test("the formal local service rejects unsafe creation for Default, generated and resized conditions", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    const service = new AuctionService(db);
    await assert.rejects(
      service.create({ ...config, studyCommission: 4 }, "Local-Test-Only", ""),
      /第12単位/,
    );
    await assert.rejects(
      service.create(
        { ...config, studyCommission: 4 },
        "Local-Test-Only",
        "",
        generator(),
      ),
      /第13単位/,
    );
    await assert.rejects(
      service.create(
        { ...config, studyCommission: 1 },
        "Local-Test-Only",
        "",
        generator(1),
      ),
      /0〜0円/,
    );
    const teacher = await service.create(
      config,
      "Local-Test-Only",
      "",
      generator(),
    );
    const view = await new AuctionService(db).view(teacher.code, teacher.token);
    assert.equal(view.config.studyCommission, 3);
    assert.deepEqual(
      view.study!.teacher!.settings,
      generateStaircase(DEFAULT_STAIRCASE_PARAMETERS).settings,
    );
    const resized: RoomConfig = {
      ...config,
      marketSize: 4,
      capacity: 4,
      studyCommission: 16,
    };
    await assert.rejects(
      service.create(resized, "Local-Test-Only", ""),
      /0〜15円/,
    );
    const req = {
      requestId: randomUUID(),
      expectedRound: 0,
      command: {
        type: "study-settings",
        settings: view.study!.teacher!.settings,
        commission: 3,
        expectedRevision: 0,
      },
    };
    assert.equal(commandSchema.safeParse(req).success, true);
    assert.equal(
      commandSchema.safeParse({
        ...req,
        command: { ...req.command, commission: 3.5 },
      }).success,
      false,
    );
  } finally {
    await pg.close();
  }
});
