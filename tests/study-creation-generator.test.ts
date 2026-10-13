import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TeacherForm } from "../src/components/teacher-form";
import { DemoSession } from "../src/lib/demo";
import {
  DEFAULT_STAIRCASE_PARAMETERS,
  generateStaircase,
  seededStudySeats,
  studyGeneratorConfigSchema,
} from "../src/lib/study-generator";
import { body, createRoomSchema } from "../src/lib/server/http";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { pptStudySettings } from "../src/lib/server/study";
import { exportData } from "../src/lib/server/export";
import type { Command, RoomConfig } from "../src/lib/types";
import type { StudyGeneratorConfig } from "../src/lib/study-types";

const config: RoomConfig = {
  protocol: "institutions-v1",
  title: "作成前の供需設定",
  markets: 1,
  marketSize: 16,
  capacity: 16,
  rounds: 3,
  duration: 180,
  studyInstitutions: ["cda", "call", "posted"],
  studyPeriods: { cda: 1, call: 1, posted: 1 },
};
const generator: StudyGeneratorConfig = {
  kind: "overlap-staircase",
  parameters: { ...DEFAULT_STAIRCASE_PARAMETERS },
  seed: 87654321,
};
const generated = generateStaircase(generator.parameters);
const password = "Local-Creation-Only-2026";
const payload = { config, generator, password };

test("teacher creation renders presets and editable p/K/L/d with a restored adopted condition", () => {
  const markup = renderToStaticMarkup(
    createElement(TeacherForm, {
      status: { mode: "local", ready: true, keyRequired: false },
      initialConfig: config,
      initialGenerator: generator,
      conditionPreset: {
        label: "Default",
        settings: pptStudySettings(),
      },
    }),
  );
  assert.match(markup, /供需条件の設定/);
  assert.match(markup, /カスタム/);
  for (const label of [
    "均衡価格 p",
    "正の余剰の単位数 K",
    "横向き重なりの長さ L",
    "階段の価格差 d",
    "割当シード",
  ])
    assert.ok(markup.includes(label));
  assert.match(markup, /作成時の条件：.*p=80・K=8・L=4・d=4/);
  assert.match(markup, /シード 87654321/);
  assert.doesNotMatch(markup, /<button[^>]*disabled=""/);
  assert.doesNotMatch(markup, /カスタムのプレビュー/);
});

test("creation request accepts only validated generator parameters and rejects stale size and forged schedules", async () => {
  assert.ok(createRoomSchema.safeParse(payload).success);
  const request = new NextRequest("http://127.0.0.1:3100/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const parsed = await body(request, createRoomSchema);
  assert.deepEqual(parsed.generator, generator);
  assert.equal(parsed.accessKey, "");
  const zeroCost = new NextRequest("http://127.0.0.1:3100/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...payload,
      generator: { ...generator, parameters: { p: 100, K: 10, L: 6, d: 10 } },
    }),
  });
  await assert.rejects(body(zeroCost, createRoomSchema), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /売り手側の費用 S\(1\)＝0円.*下限1円/s);
    assert.ok(error.message.includes("S(k)＝p − d × (K + 1 − k)"));
    assert.ok(error.message.includes("現在のK・L・dでは 101 ≤ p ≤ 99899"));
    return true;
  });
  const invalid = [
    { ...payload, config: { ...config, marketSize: 6, capacity: 6 } },
    {
      ...payload,
      generator: {
        ...generator,
        parameters: { ...generator.parameters, L: 9 },
      },
    },
    {
      ...payload,
      generator: {
        ...generator,
        parameters: { ...generator.parameters, d: 0.5 },
      },
    },
    { ...payload, generator: { ...generator, seed: -1 } },
    { ...payload, generator: { ...generator, settings: generated.settings } },
    {
      ...payload,
      config: { title: "旧実験", capacity: 12, rounds: 1, duration: 30 },
    },
  ];
  for (const input of invalid)
    assert.equal(createRoomSchema.safeParse(input).success, false);
});

test("configured demo creates the adopted staircase, edits it before starting and restores a clean selection from the student view", async () => {
  const demo = new DemoSession("cda", "buyer", 1000, {
    config,
    generator,
    lobby: true,
    teacher: true,
  });
  let view = demo.getSnapshot().view;
  assert.deepEqual(view.study!.teacher!.settings, generated.settings);
  assert.equal(view.study!.teacher!.equilibrium.quantityMax, 12);
  assert.equal(view.study!.teacher!.generation!.assignments.length, 16);
  assert.deepEqual(
    view.study!.teacher!.generation!.assignments.map((p) => p.seat),
    seededStudySeats(16, generator.seed),
  );
  assert.equal(view.study!.lobby!.randomizedAt, null);
  const modified = {
    ...generator,
    parameters: { ...generator.parameters, L: 6 },
  };
  assert.ok(
    await demo.command({
      type: "study-settings",
      generator: modified,
      settings: generateStaircase(modified.parameters).settings,
      expectedRevision: view.study!.settingsRevision,
    }),
  );
  view = demo.getSnapshot().view;
  assert.equal(view.study!.teacher!.equilibrium.quantityMax, 14);
  demo.toggleTeacher();
  assert.equal(demo.getSnapshot().view.study!.teacher, undefined);
  assert.ok(
    studyGeneratorConfigSchema.safeParse(demo.getGeneratorConfig()).success,
  );
  assert.deepEqual(demo.getGeneratorConfig(), modified);
  assert.ok(
    await demo.command(
      {
        type: "study-randomize",
        expectedRevision: view.study!.lobby!.revision,
      },
      true,
    ),
  );
  assert.ok(await demo.command({ type: "start" }, true));
  assert.equal(
    await demo.command(
      {
        type: "study-settings",
        generator,
        settings: generated.settings,
        expectedRevision: 1,
      },
      true,
    ),
    false,
  );
  assert.deepEqual(demo.getGeneratorConfig(), modified);
  const restored = new DemoSession("cda", "buyer", 2000, {
    config,
    generator: demo.getGeneratorConfig(),
    lobby: true,
    teacher: true,
  });
  assert.equal(
    restored.getSnapshot().view.study!.teacher!.equilibrium.quantityMax,
    14,
  );
});

test("local PGlite creation persists the adopted parameters, rejects invalid creation atomically and preserves pre-start edits and privacy", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    let service = new AuctionService(db);
    for (const invalid of [
      { ...generator, seed: -1 },
      { ...generator, parameters: { ...generator.parameters, p: 10 } },
      { ...generator, parameters: { ...generator.parameters, L: 9 } },
      { ...generator, parameters: { ...generator.parameters, d: 0.5 } },
    ])
      await assert.rejects(service.create(config, password, "", invalid));
    await assert.rejects(
      service.create(
        { ...config, marketSize: 6, capacity: 6 },
        password,
        "",
        generator,
      ),
      /総単位数/,
    );
    const empty = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM auction_rooms",
    );
    assert.equal(empty.rows[0].count, 0);
    const teacher = await service.create(config, password, "", generator);
    let view = await service.view(teacher.code, teacher.token);
    assert.deepEqual(view.study!.teacher!.settings, generated.settings);
    assert.equal(view.study!.teacher!.equilibrium.low, 80);
    assert.equal(view.study!.teacher!.equilibrium.high, 80);
    assert.equal(view.study!.teacher!.equilibrium.quantity, 8);
    assert.equal(view.study!.teacher!.equilibrium.quantityMax, 12);
    assert.equal(view.study!.teacher!.equilibrium.surplus, 288);
    assert.equal(view.study!.teacher!.generation!.seed, generator.seed);
    assert.deepEqual(view.study!.teacher!.generation!.assignments, []);
    assert.equal(view.study!.lobby!.randomizedAt, null);
    const createdGeneration = structuredClone(view.study!.teacher!.generation);
    const students = [];
    for (let i = 0; i < 16; i++)
      students.push(
        await service.join(teacher.code, String(1000000 + i), "1234"),
      );
    service = new AuctionService(db);
    view = await service.view(teacher.code, teacher.token);
    const saved = view.study!.teacher!.generation!;
    assert.deepEqual(
      saved.assignments.map((p) => p.seat),
      seededStudySeats(16, generator.seed),
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
    const student = await service.view(teacher.code, students[0].token);
    assert.equal(student.study!.teacher, undefined);
    assert.doesNotMatch(
      JSON.stringify(student),
      /"seed"|"parameters"|"assignments"/,
    );
    const send = async (command: Command) => {
      const current = await service.view(teacher.code, teacher.token);
      return service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: current.round,
        expectedStage: current.study!.market.stageKey,
        command,
      });
    };
    const modified = {
      ...generator,
      parameters: { ...generator.parameters, L: 6 },
      seed: 55,
    };
    await send({
      type: "study-settings",
      generator: modified,
      settings: generateStaircase(modified.parameters).settings,
      expectedRevision: view.study!.settingsRevision,
    });
    view = await service.view(teacher.code, teacher.token);
    assert.equal(view.study!.teacher!.equilibrium.quantityMax, 14);
    assert.equal(view.study!.teacher!.generation!.seed, 55);
    assert.equal(view.study!.lobby!.randomizedAt, null);
    await send({
      type: "study-randomize",
      expectedRevision: view.study!.lobby!.revision,
    });
    await send({ type: "start" });
    await assert.rejects(
      send({
        type: "study-settings",
        generator,
        settings: generated.settings,
        expectedRevision: view.study!.settingsRevision,
      }),
      /開始前/,
    );
    service = new AuctionService(db);
    view = await service.view(teacher.code, teacher.token);
    assert.equal(view.study!.teacher!.equilibrium.quantityMax, 14);
    assert.equal(view.study!.teacher!.generation!.seed, 55);
    const bundle = await service.export(teacher.code, teacher.token);
    const created = bundle.events.find(
      (event) => event.type === "room-created",
    )!;
    assert.deepEqual(created.detail.generation, createdGeneration);
    const settingsJson = JSON.parse(
      exportData(bundle.room, bundle.events, bundle.now, "settings").content,
    );
    assert.equal(settingsJson.generation.seed, 55);
    assert.equal(settingsJson.equilibrium.quantityMax, 14);
    const defaultRoom = await service.create(config, password, "");
    const defaults = await service.view(defaultRoom.code, defaultRoom.token);
    assert.deepEqual(defaults.study!.teacher!.settings, pptStudySettings());
    assert.equal(defaults.study!.teacher!.equilibrium.quantityMax, 11);
    assert.equal(defaults.study!.teacher!.equilibrium.surplus, 440);
    assert.equal(defaults.study!.teacher!.generation, undefined);
  } finally {
    await pg.close();
  }
});
