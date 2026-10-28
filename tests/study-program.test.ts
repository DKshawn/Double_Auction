import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { commandSchema, configSchema } from "../src/lib/server/http";
import { DemoSession } from "../src/lib/demo";
import type { Command, CommandRequest, RoomConfig } from "../src/lib/types";
import { DEFAULT_STUDY_TIMING } from "../src/lib/study-timing";

const config: RoomConfig = {
  title: "入室中の制度設定",
  protocol: "institutions-v1",
  markets: 1,
  marketSize: 2,
  capacity: 2,
  studyInstitutions: ["cda"],
  studyPeriods: { cda: 5 },
  rounds: 5,
  duration: 180,
};

test("teacher changes program in the same room with students present; settings survive reentry and cannot change after start", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    const service = new AuctionService(db);
    const savedConfig = configSchema.parse({
      ...config,
      studySetupConfirmed: true,
    });
    const teacher = await service.create(
      savedConfig,
      "Local-Program-Only-2026",
      "",
    );
    const first = await service.join(teacher.code, "先に入室", "1234");
    const before = await service.export(teacher.code, teacher.token);
    assert.equal(before.room.config.studySetupConfirmed, true);
    // Reviewing the creation dialog must never bypass admission/start checks.
    await assert.rejects(
      service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: 0,
        command: { type: "start" },
      }),
    );
    const request: CommandRequest = {
      requestId: randomUUID(),
      expectedRound: 0,
      command: {
        type: "study-program",
        institutions: ["cda", "call"],
        periods: { cda: 3, call: 2 },
        timing: { ...DEFAULT_STUDY_TIMING, cdaSeconds: 90, callSeconds: 5 },
        expectedRevision: 0,
      },
    };
    assert.ok(commandSchema.safeParse(request).success);
    await assert.rejects(
      service.command(teacher.code, first.token, request),
      /教員/,
    );
    const invalidTiming = {
      ...request,
      requestId: randomUUID(),
      command: {
        ...request.command,
        timing: { ...DEFAULT_STUDY_TIMING, callSeconds: 0 },
      },
    } as CommandRequest;
    assert.equal(commandSchema.safeParse(invalidTiming).success, false);
    await assert.rejects(
      service.command(teacher.code, teacher.token, invalidTiming),
      /時間/,
    );
    const rejected = await service.export(teacher.code, teacher.token);
    assert.deepEqual(rejected.room.config, before.room.config);
    assert.equal(rejected.room.study!.revision, 0);
    await service.command(teacher.code, teacher.token, request);
    await service.command(teacher.code, teacher.token, request);
    const after = await service.export(teacher.code, teacher.token);
    assert.equal(after.room.study!.revision, 1);
    assert.deepEqual(after.room.participants, before.room.participants);
    assert.deepEqual(after.room.study!.settings, before.room.study!.settings);
    assert.deepEqual(after.room.study!.markets[0].order, ["cda", "call"]);
    assert.deepEqual(after.room.config.studyPeriods, { cda: 3, call: 2 });
    assert.equal(after.room.config.rounds, 5);
    assert.equal(after.room.config.duration, 90);
    assert.equal(after.room.config.studyTiming?.callSeconds, 5);
    assert.equal(after.room.config.studySetupConfirmed, true);
    assert.equal(
      after.events.filter((e) => e.type === "study-program").length,
      1,
    );
    await assert.rejects(
      service.command(teacher.code, teacher.token, {
        ...request,
        requestId: randomUUID(),
      }),
      /更新/,
    );
    const reentry = await service.join(
      teacher.code,
      "先に入室",
      "1234",
      first.token,
    );
    assert.equal(reentry.token, first.token);
    const student = await service.view(teacher.code, first.token);
    assert.deepEqual(student.config.studyInstitutions, ["cda", "call"]);
    assert.equal(student.study!.unitLimits, null);
    await service.join(teacher.code, "後から入室", "5678");
    const send = async (command: Command) =>
      service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: 0,
        command,
      });
    const view = await service.view(teacher.code, teacher.token);
    await send({
      type: "study-randomize",
      expectedRevision: view.study!.lobby!.revision,
    });
    await send({ type: "start" });
    await assert.rejects(
      send({
        ...(request.command as Extract<Command, { type: "study-program" }>),
        expectedRevision: 1,
      }),
      /開始前/,
    );
  } finally {
    await pg.close();
  }
});

test("program validation and the single-user demo use the same command", async () => {
  const session = new DemoSession("cda", "buyer", 1000, {
    config,
    lobby: true,
    teacher: true,
  });
  const request = {
    requestId: randomUUID(),
    expectedRound: 0,
    command: {
      type: "study-program",
      institutions: ["cda"],
      periods: { cda: 2 },
      expectedRevision: 0,
    },
  };
  for (const invalid of [
    { institutions: [] },
    { institutions: ["cda", "cda"] },
    { periods: { cda: 0 } },
    { periods: { cda: 21 } },
  ])
    assert.equal(
      commandSchema.safeParse({
        ...request,
        command: { ...request.command, ...invalid },
      }).success,
      false,
    );
  await session.command({
    type: "study-program",
    institutions: ["posted"],
    periods: { posted: 2 },
    timing: { ...DEFAULT_STUDY_TIMING, offerSeconds: 5, purchaseSeconds: 80 },
    expectedRevision: 0,
  });
  const view = session.getSnapshot().view;
  assert.equal(view.config.rounds, 2);
  assert.deepEqual(view.config.studyInstitutions, ["posted"]);
  assert.equal(view.config.studyPostedMechanism, "direct-purchase-v1");
  assert.equal(view.config.studyTiming?.offerSeconds, 5);
  assert.equal(view.config.studyTiming?.purchaseSeconds, 80);
  assert.equal(view.participantCount, 2);
});
