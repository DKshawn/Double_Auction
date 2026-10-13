import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_STAIRCASE_PARAMETERS as defaults,
  generateStaircase,
  seededStudySeats,
  staircasePoints,
} from "../src/lib/study-generator";
import { equilibrium } from "../src/lib/equilibrium";
import { DemoSession, DEMO_SETTINGS } from "../src/lib/demo";
import { pptStudySettings, newStudy } from "../src/lib/server/study";
import { StudyConditionPreview } from "../src/components/study-condition-preview";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { commandSchema } from "../src/lib/server/http";
import { lockBundle, saveBundle } from "../src/lib/server/market-store";
import {
  executeStudy,
  settleStudy,
  stageKey,
  unitLimits,
} from "../src/lib/study-core";
import { studyMetrics } from "../src/lib/study-view";
import { exportData } from "../src/lib/server/export";
import type { Command, RoomConfig } from "../src/lib/types";
import type { StudyGeneratorConfig } from "../src/lib/study-types";

const generator: StudyGeneratorConfig = {
  kind: "overlap-staircase",
  parameters: { ...defaults },
  seed: 12345,
};
const generated = generateStaircase(defaults);
const config: RoomConfig = {
  title: "階段条件テスト",
  protocol: "institutions-v1",
  markets: 1,
  marketSize: 16,
  capacity: 16,
  rounds: 3,
  duration: 1,
  studyInstitutions: ["cda", "call", "posted"],
  studyPeriods: { cda: 1, call: 1, posted: 1 },
  studyTiming: {
    cdaSeconds: 1,
    callSeconds: 1,
    offerSeconds: 1,
    buyerSeconds: 1,
  },
};
const generatorCommand = (expectedRevision = 0): Command => ({
  type: "study-settings",
  settings: structuredClone(generated.settings),
  generator: structuredClone(generator),
  expectedRevision,
});

test("default staircase exactly matches all 32 marginal values and the 80, 8–12, 288 benchmark", () => {
  assert.deepEqual(
    generated.demand,
    [112, 108, 104, 100, 96, 92, 88, 84, 80, 80, 80, 80, 76, 72, 68, 64],
  );
  assert.deepEqual(
    generated.supply,
    [48, 52, 56, 60, 64, 68, 72, 76, 80, 80, 80, 80, 84, 88, 92, 96],
  );
  assert.deepEqual(generated.equilibrium, {
    low: 80,
    high: 80,
    quantity: 8,
    quantityMax: 12,
    surplus: 288,
  });
});

test("L=1,4,6 changes the overlap only, including the all-remaining-units overlap boundary", () => {
  for (const L of [1, 4, 6, 8]) {
    const next = generateStaircase({ ...defaults, L });
    assert.equal(next.equilibrium.quantityMax, 8 + L);
    assert.equal(next.equilibrium.quantity, 8);
    assert.equal(next.equilibrium.low, 80);
    assert.equal(next.equilibrium.high, 80);
    assert.equal(next.equilibrium.surplus, 288);
    assert.equal(next.demand.filter((v, i) => v === next.supply[i]).length, L);
  }
});

test("invalid parameters are rejected without silently rounding, clipping, or mutating inputs", () => {
  for (const bad of [
    { K: 0 },
    { K: 1.5 },
    { L: 0 },
    { L: 1.5 },
    { L: 9 },
    { d: 0 },
    { d: -1 },
    { d: 0.5 },
    { p: 80.5 },
    { p: 1 },
    { p: 99999 },
    { p: NaN },
    { d: Infinity },
  ])
    assert.throws(() => generateStaircase({ ...defaults, ...bad }));
  assert.throws(() => generateStaircase(defaults, 15));
  assert.throws(() => generateStaircase(defaults, 6));
  assert.deepEqual(defaults, { p: 80, K: 8, L: 4, d: 4 });
});

test("generator diagnostics identify the actual unit, calculation and range or integer failure", () => {
  const screenshot = { p: 100, K: 10, L: 6, d: 10 };
  assert.throws(
    () => generateStaircase(screenshot),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /売り手側の費用 S\(1\)＝0円/);
      assert.match(error.message, /100 − 10 × 10＝0/);
      assert.match(error.message, /下限1円/);
      assert.match(error.message, /0円は設定できません/);
      assert.match(error.message, /LはS\(1\)に影響しません/);
      assert.doesNotMatch(error.message, /整数ではありません/);
      return true;
    },
  );
  const adjusted = generateStaircase({ ...screenshot, p: 101 });
  assert.equal(adjusted.supply[0], 1);
  assert.equal(adjusted.equilibrium.low, 101);
  assert.equal(adjusted.equilibrium.high, 101);
  assert.equal(adjusted.equilibrium.quantity, 10);
  assert.equal(adjusted.equilibrium.quantityMax, 16);
  assert.throws(
    () => generateStaircase({ ...defaults, p: 99999 }),
    /買い手側の価値 D\(1\)＝100031円.*上限99999円/s,
  );
  assert.throws(
    () => generateStaircase({ ...defaults, d: 0.5 }),
    /買い手側の価値 D\(2\)＝83.5円.*整数ではありません/s,
  );
  assert.throws(
    () => generateStaircase({ p: 20, K: 1, L: 1, d: 4 }),
    /買い手側の価値 D\(7\)＝0円.*下限1円/s,
  );
  assert.throws(
    () => generateStaircase({ ...screenshot, p: 99 }),
    /売り手側の費用 S\(1\)＝-1円.*下限1円/s,
  );
  assert.deepEqual(screenshot, { p: 100, K: 10, L: 6, d: 10 });
});

test("diagnostics expand symbolic formulas and substitutions for the head, overlap and tail", () => {
  const cases = [
    {
      parameters: { p: 100, K: 10, L: 6, d: 10 },
      units: 16,
      expected: [
        "式（k ≤ K）：S(k)＝p − d × (K + 1 − k)",
        "S(1)＝100 − 10 × (10 + 1 − 1)＝100 − 10 × 10＝0",
        "必要条件：1 ≤ p − d × (K + 1 − k) ≤ 99999",
        "S(1)＝p − d × K",
        "現在のK・L・dでは 101 ≤ p ≤ 99899",
      ],
    },
    {
      parameters: { ...defaults, p: 99999 },
      units: 16,
      expected: [
        "D(k)＝p + d × (K + 1 − k)",
        "D(1)＝99999 + 4 × (8 + 1 − 1)＝99999 + 4 × 8＝100031",
        "現在のK・L・dでは 33 ≤ p ≤ 99967",
      ],
    },
    {
      parameters: { p: 0, K: 1, L: 1, d: 1 },
      units: 4,
      expected: [
        "式（K ＜ k ≤ K + L）：D(k)＝p",
        "D(2)＝p＝0",
        "必要条件：1 ≤ p ≤ 99999",
      ],
    },
    {
      parameters: { p: 20, K: 1, L: 1, d: 4 },
      units: 16,
      expected: [
        "式（k ＞ K + L）：D(k)＝p − d × (k − K − L)",
        "D(7)＝20 − 4 × (7 − 1 − 1)＝20 − 4 × 5＝0",
        "現在のK・L・dでは 57 ≤ p ≤ 99943",
      ],
    },
    {
      parameters: { p: 99796, K: 8, L: 12, d: 6 },
      units: 54,
      expected: [
        "式（k ＞ K + L）：S(k)＝p + d × (k − K − L)",
        "k=54、p=99796、K=8、L=12、d=6",
        "S(54)＝99796 + 6 × (54 − 8 − 12)＝99796 + 6 × 34＝100000",
        "必要条件：1 ≤ p + d × (k − K − L) ≤ 99999",
        "全単位の範囲条件（片側の総単位数 N=54）",
        "1 + d × max(K, N − K − L) ≤ p ≤ 99999 − d × max(K, N − K − L)",
        "現在のK・L・dでは 205 ≤ p ≤ 99795",
      ],
    },
    {
      parameters: { ...defaults, d: 0.5 },
      units: 16,
      expected: [
        "D(k)＝p + d × (K + 1 − k)",
        "D(2)＝80 + 0.5 × (8 + 1 − 2)＝80 + 0.5 × 7＝83.5",
        "全単位を整数にするにはp・dを整数にしてください。丸めは行いません。",
      ],
    },
  ];
  for (const { parameters, units, expected } of cases)
    assert.throws(
      () => generateStaircase(parameters, units),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        for (const text of expected)
          assert.ok(error.message.includes(text), text);
        return true;
      },
    );
});

test("suggested p bounds validate every unit without clipping, including the far tail", () => {
  const parameters = { p: 99796, K: 8, L: 12, d: 6 };
  for (const p of [205, 99795]) {
    const generated = generateStaircase({ ...parameters, p }, 54);
    assert.ok(
      [...generated.demand, ...generated.supply].every(
        (value) => Number.isInteger(value) && value >= 1 && value <= 99999,
      ),
    );
    assert.equal(generated.supply[53], p + 6 * (54 - 8 - 12));
  }
  for (const p of [204, 99796])
    assert.throws(() => generateStaircase({ ...parameters, p }, 54));
  assert.throws(
    () => generateStaircase({ p: 60000, K: 1, L: 1, d: 60000 }, 4),
    /120001 ≤ p ≤ -20001.*条件を満たすpはありません/s,
  );
  // The user's earlier 800 + 6 × 34 is valid under the expanded price range.
  assert.equal(
    generateStaircase({ ...parameters, p: 800 }, 54).supply[53],
    1004,
  );
});

test("pairing uses i and i+peoplePerSide for every supported market size and preserves each unit exactly once", () => {
  for (const size of [4, 6, 16, 32, 192]) {
    const next = generateStaircase({ p: 500, K: 2, L: 2, d: 1 }, size);
    const half = size / 2;
    for (let i = 0; i < half; i++) {
      assert.deepEqual(next.settings.values[i], [
        next.demand[i],
        next.demand[i + half],
      ]);
      assert.deepEqual(next.settings.costs[i], [
        next.supply[i],
        next.supply[i + half],
      ]);
      assert.ok(next.settings.values[i][0] >= next.settings.values[i][1]);
      assert.ok(next.settings.costs[i][0] <= next.settings.costs[i][1]);
    }
    assert.deepEqual(
      next.settings.values.flat().sort((a, b) => b - a),
      next.demand,
    );
    assert.deepEqual(
      next.settings.costs.flat().sort((a, b) => a - b),
      next.supply,
    );
  }
});

test("fixed seed reproducibly permutes all seats without loss and rejects invalid seeds", () => {
  const seats = seededStudySeats(32, 12345);
  assert.deepEqual(seededStudySeats(32, 12345), seats);
  assert.notDeepEqual(seededStudySeats(32, 12346), seats);
  assert.deepEqual(
    [...seats].sort((a, b) => a - b),
    Array.from({ length: 32 }, (_, i) => i),
  );
  for (const bad of [-1, 1.5, NaN, 4294967296])
    assert.throws(() => seededStudySeats(16, bad));
});

test("chart steps cover k-1..k with no diagonal interpolation and expose the entire preview table", () => {
  assert.deepEqual(staircasePoints([112, 108, 80]), [
    [0, 112],
    [1, 112],
    [1, 108],
    [2, 108],
    [2, 80],
    [3, 80],
  ]);
  const points = staircasePoints(generated.demand);
  for (let i = 1; i < points.length; i++)
    assert.ok(
      points[i][0] === points[i - 1][0] || points[i][1] === points[i - 1][1],
    );
  const html = renderToStaticMarkup(
    createElement(StudyConditionPreview, { settings: generated.settings }),
  );
  assert.ok(
    html.includes("重なり ") && html.includes("8") && html.includes("12"),
  );
  assert.equal((html.match(/<th scope="row">\d+<\/th>/g) ?? []).length, 16);
  assert.equal((html.match(/study-zero-surplus-row/g) ?? []).length, 4);
  const chart = html.match(/<svg[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/)?.[0];
  assert.ok(html.includes("288") && chart && !chart.includes("<path"));
});

test("PPT remains the unchanged default with equilibrium 10–11 and maximum surplus 440", () => {
  const ppt = pptStudySettings();
  const eq = equilibrium(ppt.values.flat(), ppt.costs.flat());
  assert.equal(eq.quantity, 10);
  assert.equal(eq.quantityMax, 11);
  assert.equal(eq.surplus, 440);
  assert.deepEqual(newStudy(1).settings, ppt);
  generateStaircase(defaults);
  assert.deepEqual(pptStudySettings(), ppt);
});

test("demo previews do not apply automatically, saves reproducible allocation, and locks it through all institutions", async () => {
  const demos = [1, 2].map(
    () =>
      new DemoSession("cda", "buyer", 1000, {
        lobby: true,
        teacher: true,
        config,
      }),
  );
  const maps = [];
  for (const demo of demos) {
    assert.deepEqual(
      demo.getSnapshot().view.study!.teacher!.settings,
      DEMO_SETTINGS,
    );
    generateStaircase(defaults);
    assert.deepEqual(
      demo.getSnapshot().view.study!.teacher!.settings,
      DEMO_SETTINGS,
    );
    assert.ok(await demo.command(generatorCommand()));
    let view = demo.getSnapshot().view;
    assert.equal(view.study!.teacher!.generation!.seed, 12345);
    assert.equal(view.study!.lobby!.randomizedAt, null);
    assert.equal(view.study!.teacher!.generation!.assignments.length, 16);
    assert.ok(
      await demo.command({
        type: "study-randomize",
        expectedRevision: view.study!.lobby!.revision,
      }),
    );
    view = demo.getSnapshot().view;
    const saved = structuredClone(view.study!.teacher!.generation!);
    maps.push(
      saved.assignments.map(({ participantId: _id, ...row }) => {
        void _id;
        return row;
      }),
    );
    assert.deepEqual(
      saved.assignments
        .filter((p) => p.role === "buyer")
        .flatMap((p) => p.limits)
        .sort((a, b) => b - a),
      generated.demand,
    );
    assert.deepEqual(
      saved.assignments
        .filter((p) => p.role === "seller")
        .flatMap((p) => p.limits)
        .sort((a, b) => a - b),
      generated.supply,
    );
    assert.ok(await demo.command({ type: "start" }));
    assert.equal(
      await demo.command(generatorCommand(1)),
      false,
      "even the five-second start countdown locks conditions",
    );
    assert.ok(await demo.command({ type: "pause" }));
    assert.equal(await demo.command(generatorCommand(1)), false);
    assert.ok(await demo.command({ type: "resume" }));
    for (
      let i = 0;
      i < 30 && demo.getSnapshot().view.phase !== "finished";
      i++
    ) {
      demo.advanceTime(30000);
      assert.deepEqual(
        demo.getSnapshot().view.study!.teacher!.generation,
        saved,
      );
      assert.deepEqual(
        demo.getSnapshot().view.study!.teacher!.settings,
        generated.settings,
      );
    }
    assert.equal(demo.getSnapshot().view.phase, "finished");
    assert.equal(demo.getSnapshot().view.study!.teacher!.metrics.length, 3);
    assert.equal(await demo.command(generatorCommand(1)), false);
  }
  assert.deepEqual(maps[0], maps[1]);
});

test("authoritative engine rejects forged generator metadata and stale settings revisions atomically", async () => {
  const demo = new DemoSession("cda", "buyer", 1000, {
    lobby: true,
    teacher: true,
    config,
  });
  const original = structuredClone(
    demo.getSnapshot().view.study!.teacher!.settings,
  );
  const command = generatorCommand();
  assert.equal(command.type, "study-settings");
  if (command.type !== "study-settings") throw new Error("wrong fixture");
  command.settings.values[0][0]++;
  assert.equal(await demo.command(command), false);
  assert.deepEqual(demo.getSnapshot().view.study!.teacher!.settings, original);
  assert.equal(demo.getSnapshot().view.study!.teacher!.generation, undefined);
  assert.ok(await demo.command(generatorCommand()));
  assert.equal(await demo.command(generatorCommand()), false);
  const saved = structuredClone(
    demo.getSnapshot().view.study!.teacher!.generation,
  );
  assert.equal(
    await demo.command({
      ...generatorCommand(1),
      generator: { ...generator, parameters: { ...defaults, L: 9 } },
    } as Command),
    false,
  );
  assert.deepEqual(demo.getSnapshot().view.study!.teacher!.generation, saved);
});

test("local PGlite service persists seed, late admissions and final assignments, hides them from students, and exports them", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    let service = new AuctionService(db);
    const teacher = await service.create(
      config,
      "Local-Generator-Test-2026",
      "",
    );
    const send = async (token: string, command: Command) => {
      const view = await service.view(teacher.code, token);
      const request = {
        requestId: randomUUID(),
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        command,
      };
      assert.ok(commandSchema.safeParse(request).success);
      return service.command(teacher.code, token, request);
    };
    const original = await service.view(teacher.code, teacher.token);
    assert.equal(original.study!.teacher!.equilibrium.surplus, 440);
    assert.deepEqual(
      original.study!.teacher!.preset!.settings,
      pptStudySettings(),
    );
    await send(teacher.token, generatorCommand());
    const students = [];
    for (let i = 0; i < 16; i++)
      students.push(
        await service.join(teacher.code, String(1000000 + i), "1234"),
      );
    const student = await service.view(teacher.code, students[0].token);
    assert.equal(student.study!.teacher, undefined);
    assert.equal(student.study!.unitLimits, null);
    assert.ok(
      !JSON.stringify(student).includes("assignments") &&
        !JSON.stringify(student).includes("seed"),
    );
    await assert.rejects(send(students[0].token, generatorCommand(1)), /教員/);
    service = new AuctionService(db);
    const reloaded = await service.view(teacher.code, teacher.token);
    assert.equal(reloaded.study!.teacher!.generation!.assignments.length, 16);
    await send(teacher.token, {
      type: "study-randomize",
      expectedRevision: reloaded.study!.lobby!.revision,
    });
    const allocated = await service.view(teacher.code, teacher.token);
    const saved = structuredClone(allocated.study!.teacher!.generation!);
    assert.ok(saved.assignmentConfirmedAt);
    assert.equal(saved.seed, 12345);
    await send(teacher.token, {
      type: "study-randomize",
      expectedRevision: allocated.study!.lobby!.revision,
    });
    assert.deepEqual(
      (await service.view(teacher.code, teacher.token)).study!.teacher!
        .generation!.assignments,
      saved.assignments,
    );
    await send(teacher.token, { type: "start" });
    await assert.rejects(send(teacher.token, generatorCommand(1)), /開始前/);
    const bundle = await service.export(teacher.code, teacher.token);
    const lockedGeneration = structuredClone(bundle.room.study!.generation);
    const finalEvents: typeof bundle.events = [];
    while (bundle.room.phase !== "finished") {
      const deadline = bundle.room.study!.markets[0].deadline!;
      settleStudy(bundle.room, deadline, finalEvents);
      assert.deepEqual(bundle.room.study!.generation, lockedGeneration);
    }
    await db.transaction(async (tx) => {
      const before = await lockBundle(tx, teacher.code, undefined, true);
      await saveBundle(tx, before, bundle.room, finalEvents);
    });
    service = new AuctionService(db);
    const final = await service.view(teacher.code, teacher.token);
    assert.equal(final.phase, "finished");
    assert.deepEqual(final.study!.teacher!.generation, lockedGeneration);
    assert.deepEqual(final.study!.teacher!.settings, generated.settings);
    const exported = JSON.parse(
      exportData(bundle.room, bundle.events, bundle.now, "settings").content,
    );
    assert.deepEqual(exported.generation, lockedGeneration);
    assert.equal(exported.equilibrium.quantityMax, 12);
    // Exercise the unchanged Call matcher with truthful test submissions:
    // eight positive-surplus plus four zero-surplus fills are fully efficient.
    const metricRoom = structuredClone(bundle.room);
    metricRoom.phase = "waiting";
    metricRoom.round = 0;
    metricRoom.receipts = [];
    metricRoom.config.studyInstitutions = ["call"];
    metricRoom.config.studyPeriods = { call: 1 };
    metricRoom.config.rounds = 1;
    metricRoom.study = newStudy(1, 16, ["call"]);
    const market = metricRoom.study!.markets[0];
    const executeTest = (
      actor: "teacher" | (typeof metricRoom.participants)[number],
      command: Command,
    ) =>
      executeStudy(
        metricRoom,
        actor,
        {
          requestId: randomUUID(),
          expectedRound: metricRoom.round,
          expectedStage: stageKey(metricRoom, market),
          command,
        },
        1000,
        [],
      );
    executeTest("teacher", generatorCommand());
    executeTest("teacher", { type: "start" });
    for (const participant of metricRoom.participants)
      executeTest(participant, {
        type: "call-submit",
        prices: [...unitLimits(metricRoom, participant)],
      });
    settleStudy(metricRoom, market.deadline!, []);
    assert.equal(market.trades.length, 12);
    assert.ok(market.trades.every((trade) => trade.price === 80));
    const metric = studyMetrics(metricRoom, 2000)[0];
    assert.equal(metric.quantityRatio, 1.5);
    assert.equal(metric.inefficientTrades, 0);
    assert.equal(metric.efficiency, 100);
    await assert.rejects(send(teacher.token, generatorCommand(1)), /開始前/);
  } finally {
    await pg.close();
  }
});
