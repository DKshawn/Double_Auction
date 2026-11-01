import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import { JudgmentService } from "../src/experiments/judgment/server/service";
import { experimentFor } from "../src/lib/server/experiment-registry";
import {
  conversationPairs,
  fingerprint,
  makeRun,
  preview,
  records,
  state,
  studies,
  submit,
  TRANSLATION_VERSION,
  validateSettings,
  withdraw,
} from "../src/experiments/judgment/server/core";
import { classroomProtocol } from "../src/experiments/judgment/vendor/server/classroom.mjs";
import { localizeTrial } from "../src/experiments/judgment/vendor/public/i18n.js";
import {
  createPreviewState,
  previewRun,
} from "../src/experiments/judgment/vendor/public/preview-state.js";
import {
  captureTimedInput,
  createTimedAttempt,
  finishTimedAttempt,
} from "../src/experiments/judgment/vendor/public/timed-response.js";
import type {
  Answer,
  Lesson,
  Run,
  Settings,
  Submission,
  Trial,
} from "../src/experiments/judgment/types";
import protocolFixtures from "./fixtures/judgment-protocols.json";

let pg: PGlite, db: Database, service: JudgmentService;
before(async () => {
  pg = new PGlite();
  db = localDatabase(pg);
  await migrate(db);
  service = new JudgmentService(db);
});
after(async () => {
  await pg.close();
});
const settings = (studyIds = ["03-01"]): Settings => ({
  studyIds,
  randomizeExperiments: false,
  randomizeChoices: false,
});
const password = "Judgment-Test-2026";
const lesson = (plan = settings()): Lesson => ({
  id: randomUUID(),
  number: 1,
  status: "active",
  createdAt: 0,
  endedAt: null,
  settings: plan,
  settingsHash: fingerprint(plan),
});
const metrics = (ms = 100) => ({
  rtMs: ms,
  activeMs: ms,
  focusLosses: 0,
  reloadCount: 0,
  language: "ja",
  translationVersion: TRANSLATION_VERSION,
  languageHistory: [{ language: "ja", atActiveMs: 0 }],
});
function answerFor(trial: Trial): Answer {
  const answer: Answer = {};
  for (const field of trial.fields) {
    const when = field.when as { id: string; equals: string } | undefined;
    if (when && answer[when.id] !== when.equals) continue;
    if (field.type === "choice")
      answer[field.id] = (field.options as { value: string }[])[0].value;
    else if (field.type === "text")
      answer[field.id] =
        field.id === "partnerStudentId"
          ? "0012346"
          : "この選択について考えました。";
    else
      answer[field.id] = field.readOnly
        ? field.value
        : Math.max(Number(field.min ?? 0), field.exclusiveMin ? 1 : 0);
  }
  if (trial.rankFields)
    (trial.rankFields as string[]).forEach((id, i) => {
      answer[id] = i + 1;
    });
  if (trial.sumFields) {
    const ids = trial.sumFields as string[];
    ids.forEach((id, i) => {
      answer[id] = i === 0 ? 100 : 0;
    });
  }
  if (trial.ratioFields) {
    const ids = trial.ratioFields as string[];
    answer[ids[0]] = 1;
  }
  return answer;
}
function payload(run: Run, now: number): Submission {
  const view = state(run, now),
    trial = view.trial!;
  const ms = Math.max(100, trial.minViewMs ?? 0);
  return {
    trialIndex: view.currentIndex,
    trialId: trial.id,
    submissionId: randomUUID(),
    answer: answerFor(trial),
    metrics: {
      ...metrics(ms),
      ...(trial.responseWindowMs
        ? {
            timed: {
              limitMs: trial.responseWindowMs,
              elapsedMs: ms,
              endReason: "submitted",
            },
          }
        : {}),
    },
  };
}
async function room(plan = settings()) {
  const teacher = await service.create({
    title: "判断ラボ test",
    password,
    accessKey: "",
    settings: plan,
  });
  const join = (studentId = "0012345", pin = "1234") =>
    service.login(teacher.code, { role: "student", studentId, pin });
  const start = async (custom = plan) => {
    const view = await service.teacherView(teacher.code, teacher.token);
    return service.command(teacher.code, teacher.token, {
      kind: "start",
      settings: custom,
      expectedRevision: view.revision,
      requestId: randomUUID(),
    });
  };
  const end = async () => {
    const view = await service.teacherView(teacher.code, teacher.token);
    return service.command(teacher.code, teacher.token, {
      kind: "end",
      lessonId: view.lesson!.id,
      expectedRevision: view.revision,
      requestId: randomUUID(),
    });
  };
  return { teacher, join, start, end };
}

test("judgment exposes exactly the 14 runnable tasks and rejects retired or duplicate tasks", () => {
  assert.deepEqual(
    studies.map((s) => s.id),
    [
      "01-02",
      "03-01",
      "03-02",
      "04-01",
      "06-01",
      "08-01",
      "09-07",
      "11-06",
      "12-01",
      "14-01",
      "23-01",
      "25-01",
      "26-01",
      "33-03",
    ],
  );
  for (const ids of [[], ["04-07"], ["03-01", "03-01"]])
    assert.throws(() => validateSettings(settings(ids)));
  assert.deepEqual(validateSettings(settings(["25-01", "03-01"])).studyIds, [
    "03-01",
    "25-01",
  ]);
});
test("protocols match pinned upstream fixtures for conditions, wording, measurements and option order", () => {
  for (const fixture of protocolFixtures)
    assert.equal(
      fingerprint(classroomProtocol(fixture.id, fixture.seed, fixture.choices)),
      fixture.hash,
      JSON.stringify(fixture),
    );
});
for (const study of studies)
  test(`judgment ${study.id}: completes preserved protocol and exports every answer`, () => {
    const run = makeRun(lesson(settings([study.id])), "0012345", 0);
    let now = 0;
    while (run.status === "active") {
      const input = payload(run, now),
        trial = state(run, now).trial!;
      now += Math.max(100, trial.minViewMs ?? 0);
      const immutable = structuredClone(trial);
      for (const language of ["ja", "zh", "en"]) {
        const localized = localizeTrial(trial, language);
        assert.equal(localized.fields.length, trial.fields.length);
        assert.deepEqual(trial, immutable);
      }
      submit(run, input, now);
    }
    const output = records(run);
    assert.equal(run.status, "completed");
    assert.equal(
      output.sessions[0].responses.length,
      run.steps[0].protocol.trials.length,
    );
    assert.ok(
      output.sessions[0].responses.every(
        (r) => r.metrics.presentations?.length === 1,
      ),
    );
  });
test("all 14 tasks make 86 pages, preserve internal order, and do not reveal future material", () => {
  const run = makeRun(
    lesson({
      ...settings(studies.map((s) => s.id)),
      randomizeExperiments: true,
      randomizeChoices: true,
    }),
    "0012345",
    0,
  );
  const view = state(run, 10);
  assert.equal(view.totalTrials, 86);
  assert.deepEqual(
    Object.keys(view).sort(),
    [
      "currentIndex",
      "debrief",
      "id",
      "pairCode",
      "pairSetup",
      "status",
      "studentId",
      "totalTrials",
      "trial",
    ].sort(),
  );
  assert.ok(!JSON.stringify(view).includes('"normative"'));
  assert.equal(run.steps.length, 14);
  const original = structuredClone(run.steps.map((s) => s.protocol));
  state(run, 100);
  assert.deepEqual(
    run.steps.map((s) => s.protocol),
    original,
  );
});
test("timed input retains pre-deadline value; interruption and zero remain distinct", () => {
  const attempt = createTimedAttempt(5000, 0);
  captureTimedInput(attempt, "0", 4990);
  captureTimedInput(attempt, "99", 5001);
  assert.equal(finishTimedAttempt(attempt, "deadline", 5010)?.estimate, 0);
  assert.equal(finishTimedAttempt(attempt, "submitted", 5011), null);
  const interrupted = createTimedAttempt(5000, 0);
  captureTimedInput(interrupted, "100", 100);
  assert.equal(
    finishTimedAttempt(interrupted, "interrupted", 200)?.estimate,
    null,
  );
});
test("timed server validation rejects early deadlines, empty submissions and fabricated interruption values", () => {
  const run = makeRun(lesson(settings(["11-06"])), "0012345", 0);
  submit(run, payload(run, 0), 100);
  const trial = state(run, 100).trial!;
  assert.equal(trial.responseWindowMs, 5000);
  const input = payload(run, 100);
  input.metrics = {
    ...metrics(5000),
    timed: { limitMs: 5000, elapsedMs: 5000, endReason: "deadline" },
  };
  assert.throws(() => submit(structuredClone(run), input, 200));
  input.metrics = {
    ...metrics(100),
    timed: { limitMs: 5000, elapsedMs: 100, endReason: "submitted" },
  };
  input.answer = { estimate: null };
  assert.throws(() => submit(structuredClone(run), input, 200));
  input.metrics = {
    ...metrics(100),
    timed: { limitMs: 5000, elapsedMs: 100, endReason: "interrupted" },
  };
  input.answer = { estimate: 12 };
  assert.throws(() => submit(structuredClone(run), input, 200));
  input.answer = { estimate: null };
  assert.equal(submit(run, input, 200).status, "completed");
  assert.equal(run.steps[0].responses[1].answer.estimate, null);
});
test("debrief mentions the history manipulation only after its material was shown", () => {
  const unseen = makeRun(lesson(settings(["03-01", "23-01"])), "0012345", 0);
  state(unseen, 0);
  assert.deepEqual(withdraw(unseen, 100).debrief, []);
  const seen = makeRun(lesson(settings(["23-01"])), "0012345", 0);
  state(seen, 0);
  assert.match(withdraw(seen, 100).debrief![0], /歴史課題/);
});
test("preview skips risk ranking safely, retains tied minima, and never mutates templates", () => {
  const protocols = preview(settings(["33-03"])),
    before = structuredClone(protocols),
    p = createPreviewState(protocols);
  p.index = 1;
  assert.equal(
    previewRun(p).trial.fields.filter((f: { readOnly?: boolean }) => f.readOnly)
      .length,
    1,
  );
  const ids = protocols[0].trials[0].rankFields as string[];
  (p.answers as Answer[])[0] = Object.fromEntries(
    ids.map((id, i) => [id, i < 2 ? 1 : i + 1]),
  );
  assert.equal(
    previewRun(p).trial.fields.filter((f: { readOnly?: boolean }) => f.readOnly)
      .length,
    2,
  );
  assert.deepEqual(protocols, before);
});
test("room registry migrates existing two-experiment constraints and supports judgment", async () => {
  await db.query(
    "ALTER TABLE lab_room_registry DROP CONSTRAINT lab_room_registry_experiment_check",
  );
  await db.query(
    "ALTER TABLE lab_room_registry ADD CONSTRAINT lab_room_registry_experiment_check CHECK(experiment IN ('institutions','emh'))",
  );
  await migrate(db);
  const r = await room();
  assert.equal(await experimentFor(r.teacher.code, db), "judgment");
  await migrate(db);
  assert.equal(await experimentFor(r.teacher.code, db), "judgment");
  const list = await service.listRooms("");
  assert.equal(
    list.find((s) => s.code === r.teacher.code)?.experiment,
    "judgment",
  );
});
test("seven-digit identity, PIN reentry, teacher session rotation and throttling", async () => {
  const { teacher, join } = await room();
  await assert.rejects(join("123"), { status: 400 });
  const student = await join();
  assert.equal(
    (await service.studentView(teacher.code, student.token)).studentId,
    "0012345",
  );
  for (let i = 0; i < 5; i++)
    await assert.rejects(join("0012345", "9999"), { status: 403 });
  await assert.rejects(join(), { status: 429 });
  await db.query("DELETE FROM judgment_logins WHERE room_code=$1", [
    teacher.code,
  ]);
  const replacement = await join();
  await assert.rejects(service.studentView(teacher.code, student.token), {
    status: 401,
  });
  assert.equal(
    (await service.studentView(teacher.code, replacement.token)).phase,
    "waiting",
  );
  await assert.rejects(service.teacherView(teacher.code, replacement.token), {
    status: 401,
  });
  const second = await service.login(teacher.code, {
    role: "teacher",
    password,
  });
  await assert.rejects(service.teacherView(teacher.code, teacher.token), {
    status: 401,
  });
  assert.equal(
    (await service.teacherView(teacher.code, second.token)).code,
    teacher.code,
  );
});
test("waiting and late students receive one durable assignment, and public state omits answers and conditions", async () => {
  const r = await room({
      ...settings(["01-02", "04-01", "33-03"]),
      randomizeExperiments: true,
      randomizeChoices: true,
    }),
    a = await r.join();
  assert.equal((await service.studentView(a.code, a.token)).run, null);
  await r.start();
  const first = await service.studentView(a.code, a.token),
    again = await new JudgmentService(db).studentView(a.code, a.token);
  assert.deepEqual(again, first);
  const stored = (
    await db.query<{ state: Run }>(
      "SELECT state FROM judgment_runs WHERE id=$1",
      [first.run!.id],
    )
  ).rows[0].state;
  for (const step of stored.steps)
    assert.equal(fingerprint(step.protocol), step.protocolHash);
  assert.equal(first.run!.trial!.id, stored.steps[0].protocol.trials[0].id);
  assert.ok(stored.steps[0].presentedAt !== null);
  const b = await r.join("0012346"),
    late = await service.studentView(b.code, b.token);
  assert.equal(late.lesson!.id, first.lesson!.id);
  assert.notEqual(late.run!.id, first.run!.id);
  await assert.rejects(service.run(a.code, a.token, late.run!.id), {
    status: 404,
  });
  await assert.rejects(service.export(a.code, a.token, "json"), {
    status: 401,
  });
});
test("answer transactions validate first, persist once across retries, and reject changed or skipped submissions", async () => {
  const r = await room(),
    student = await r.join();
  await r.start();
  const view = (await service.studentView(student.code, student.token)).run!;
  const input: Submission = {
    trialIndex: 0,
    trialId: view.trial!.id,
    submissionId: randomUUID(),
    answer: answerFor(view.trial!),
    metrics: metrics(),
  };
  await assert.rejects(
    service.run(student.code, student.token, view.id, {
      ...input,
      answer: { hospital: "bad" },
    }),
    { status: 400 },
  );
  await assert.rejects(
    service.run(student.code, student.token, view.id, {
      ...input,
      trialIndex: 1,
    }),
    { status: 409 },
  );
  const results = await Promise.all([
    service.run(student.code, student.token, view.id, input),
    service.run(student.code, student.token, view.id, input),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].status, "completed");
  await assert.rejects(
    service.run(student.code, student.token, view.id, {
      ...input,
      metrics: metrics(101),
    }),
    { status: 409 },
  );
  const exported = await service.export(
    r.teacher.code,
    r.teacher.token,
    "json",
  );
  assert.ok(typeof exported !== "string");
  assert.equal(exported.runs[0].sessions[0].responses.length, 1);
  assert.ok(
    !/pinHash|tokenHash|passwordHash|payloadHash/.test(
      JSON.stringify(exported),
    ),
  );
  const csv = await service.export(r.teacher.code, r.teacher.token, "csv");
  assert.equal(typeof csv, "string");
  assert.match(csv as string, /0012345/);
  assert.match(csv as string, /hospital/);
});
test("teacher commands are idempotent; stale settings are rejected and later lessons are independent", async () => {
  const r = await room(),
    student = await r.join();
  const start = {
    kind: "start" as const,
    requestId: randomUUID(),
    expectedRevision: 0,
    settings: settings(),
  };
  const first = await service.command(r.teacher.code, r.teacher.token, start);
  assert.deepEqual(
    await service.command(r.teacher.code, r.teacher.token, start),
    first,
  );
  await assert.rejects(
    service.command(r.teacher.code, r.teacher.token, {
      ...start,
      settings: settings(["25-01"]),
    }),
    { status: 409 },
  );
  const v1 = (await service.studentView(student.code, student.token)).run!;
  await r.end();
  assert.equal(
    (await service.run(student.code, student.token, v1.id)).status,
    "withdrawn",
  );
  await assert.rejects(
    service.command(r.teacher.code, r.teacher.token, {
      ...start,
      requestId: randomUUID(),
    }),
    { status: 409 },
  );
  await r.start(settings(["25-01"]));
  const v2 = (await service.studentView(student.code, student.token)).run!;
  assert.notEqual(v2.id, v1.id);
  assert.equal(v2.currentIndex, 0);
  assert.equal(
    (await service.teacherView(r.teacher.code, r.teacher.token)).history.length,
    2,
  );
});
test("ending races with an answer without leaving an active run or duplicating data", async () => {
  const r = await room(),
    student = await r.join();
  await r.start();
  const v = (await service.studentView(student.code, student.token)).run!;
  const input: Submission = {
    trialIndex: 0,
    trialId: v.trial!.id,
    submissionId: randomUUID(),
    answer: answerFor(v.trial!),
    metrics: metrics(),
  };
  const outcomes = await Promise.allSettled([
    r.end(),
    service.run(student.code, student.token, v.id, input),
  ]);
  assert.equal(outcomes[0].status, "fulfilled");
  if (outcomes[1].status === "rejected")
    assert.equal(outcomes[1].reason.status, 409);
  const final = await service.run(student.code, student.token, v.id);
  assert.notEqual(final.status, "active");
  assert.ok(final.currentIndex <= 1);
});
test("risk ratio baseline and immutable rankings are enforced from the saved response", () => {
  const run = makeRun(lesson(settings(["33-03"])), "0012345", 0),
    first = payload(run, 0);
  submit(run, first, 100);
  const next = payload(run, 100),
    trial = state(run, 100).trial!;
  const locked = trial.fields.find((f) => f.readOnly)!;
  assert.ok(locked);
  next.answer[locked.id] = 11;
  assert.throws(() => submit(structuredClone(run), next, 200));
  next.answer[locked.id] = 10;
  assert.equal(submit(run, next, 200).currentIndex, 2);
});
test("conversation pairing is reciprocal in one lesson and preserves independent estimates", () => {
  const shared = lesson(settings(["12-01"]));
  const make = (
    student: string,
    partner: string,
    self: number,
    other: number,
    context = shared,
  ) => {
    const run = makeRun(context, student, 0),
      input = payload(run, 0);
    input.answer = {
      partnerStudentId: partner,
      selfSpeakingPercent: self,
      partnerSpeakingPercent: other,
    };
    submit(run, input, 100);
    return run;
  };
  const a = make("0012345", "0012346", 70, 45),
    b = make("0012346", "0012345", 65, 40);
  const result = conversationPairs([a, b]);
  assert.equal(result.paired.length, 1);
  assert.deepEqual(result.paired[0].withinResponseSums, [115, 105]);
  assert.equal(result.paired[0].selfEstimateSumExcess, 35);
  const other = make("0012346", "0012345", 65, 40, lesson(settings(["12-01"])));
  assert.equal(conversationPairs([a, other]).paired.length, 0);
  const self = makeRun(shared, "0012345", 0),
    input = payload(self, 0);
  input.answer.partnerStudentId = "0012345";
  assert.throws(() => submit(self, input, 100));
});
test("preview leaves room data untouched; room deletion removes its data and code only", async () => {
  const a = await room(),
    b = await room(),
    student = await a.join();
  await a.start();
  await service.studentView(student.code, student.token);
  const before = await service.export(a.teacher.code, a.teacher.token, "json");
  assert.equal(
    (
      await service.preview(
        a.teacher.code,
        a.teacher.token,
        settings(["33-03"]),
      )
    ).protocols.length,
    1,
  );
  assert.deepEqual(
    await service.export(a.teacher.code, a.teacher.token, "json"),
    before,
  );
  await service.deleteRoom(a.teacher.code, "");
  assert.equal(await experimentFor(a.teacher.code, db), null);
  await assert.rejects(service.studentView(student.code, student.token), {
    status: 404,
  });
  assert.equal(await experimentFor(b.teacher.code, db), "judgment");
  for (const table of [
    "judgment_runs",
    "judgment_participants",
    "judgment_lessons",
    "judgment_commands",
    "judgment_logins",
  ]) {
    assert.equal(
      (
        await db.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM ${table} WHERE room_code=$1`,
          [a.teacher.code],
        )
      ).rows[0].count,
      0,
    );
  }
});
