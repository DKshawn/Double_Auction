import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  studies,
  TRANSLATION_VERSION,
} from "../src/experiments/judgment/server/core";
import type {
  Answer,
  RunView,
  Settings,
  StudentView,
  TeacherView,
  Trial,
} from "../src/experiments/judgment/types";

import { verificationTarget } from "./verification-target";
const { origin, accessKey } = verificationTarget("JUDGMENT_TEST_ORIGIN");
type Client = { cookie: string };
async function request<T>(
  path: string,
  client: Client,
  data?: unknown,
  expected = 200,
): Promise<T> {
  const response = await fetch(origin + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Cookie: client.cookie,
      Origin: origin,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  assert.equal(response.status, expected, `${path}: ${response.status}`);
  const cookie = response.headers.get("set-cookie");
  if (cookie) {
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.match(cookie, /Path=\/api\/rooms\/[A-Z2-9]{6}/);
    client.cookie = cookie.split(";")[0];
  }
  return (await response.json()) as T;
}
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
          : "選択について考えました。";
    else
      answer[field.id] = field.readOnly
        ? field.value
        : Math.max(Number(field.min ?? 0), field.exclusiveMin ? 1 : 0);
  }
  if (trial.rankFields)
    (trial.rankFields as string[]).forEach((id, i) => {
      answer[id] = i + 1;
    });
  if (trial.sumFields)
    (trial.sumFields as string[]).forEach((id, i) => {
      answer[id] = i ? 0 : 100;
    });
  if (trial.ratioFields) answer[(trial.ratioFields as string[])[0]] = 1;
  return answer;
}
async function main() {
  const teacher: Client = { cookie: "" },
    student: Client = { cookie: "" },
    other: Client = { cookie: "" };
  const settings: Settings = {
    studyIds: studies.map((s) => s.id),
    randomizeExperiments: false,
    randomizeChoices: true,
  };
  const { code } = await request<{ code: string }>(
    "/api/judgment/rooms",
    teacher,
    {
      title: "判断ラボ HTTP 検証",
      password: "Judgment-Test-2026",
      accessKey,
      settings,
    },
  );
  const base = `/api/rooms/${code}`,
    api = base + "/judgment";
  assert.deepEqual(await request(base + "/entry", { cookie: "" }), {
    experiment: "judgment",
  });
  await request(base + "/join", student, { nickname: "0012345", pin: "1234" });
  assert.equal(
    (await request<StudentView>(api + "?session=student", student)).run,
    null,
  );
  await request(api + "?session=teacher", student, undefined, 401);
  const bothRoles = { cookie: teacher.cookie + "; " + student.cookie };
  await request(
    api + "/export?format=json&session=student",
    bothRoles,
    undefined,
    401,
  );
  await request(
    api + "?session=student",
    bothRoles,
    { kind: "start", settings, requestId: randomUUID(), expectedRevision: 0 },
    401,
  );
  const publicView = await request<StudentView>(
    api + "?session=student",
    bothRoles,
  );
  assert.equal(publicView.studentId, "0012345");
  assert.ok(!JSON.stringify(publicView).includes('"settings"'));
  await request(api + "/preview?session=teacher", student, settings, 401);
  await request(
    base + "/join",
    other,
    { nickname: "0012345", pin: "9999" },
    403,
  );
  await request(base + "/join", other, { nickname: "0012346", pin: "1234" });
  const crossOrigin = await fetch(origin + api + "?session=teacher", {
    method: "POST",
    headers: {
      Cookie: teacher.cookie,
      "Content-Type": "application/json",
      Origin: "https://unrelated.invalid",
    },
    body: JSON.stringify({
      kind: "start",
      requestId: randomUUID(),
      expectedRevision: 0,
      settings,
    }),
  });
  assert.equal(crossOrigin.status, 403);
  const dashboard = await request<TeacherView>(
    api + "?session=teacher",
    teacher,
    { kind: "start", requestId: randomUUID(), expectedRevision: 0, settings },
  );
  let view = (await request<StudentView>(api + "?session=student", student))
    .run!;
  assert.equal(view.totalTrials, 86);
  const firstId = view.id;
  assert.deepEqual(
    (await request<StudentView>(api + "?session=student", student)).run,
    view,
  );
  await request(
    `${api}/runs/${firstId}?session=student`,
    other,
    undefined,
    404,
  );
  let responses = 0;
  while (view.status === "active") {
    const trial = view.trial!;
    const ms = Math.max(100, trial.minViewMs ?? 0, trial.responseWindowMs ?? 0);
    if (ms > 100) await delay(ms + 110);
    const payload = {
      trialIndex: view.currentIndex,
      trialId: trial.id,
      submissionId: randomUUID(),
      answer: answerFor(trial),
      metrics: {
        rtMs: ms,
        activeMs: ms,
        focusLosses: 0,
        reloadCount: 0,
        language: "ja",
        translationVersion: TRANSLATION_VERSION,
        languageHistory: [{ language: "ja", atActiveMs: 0 }],
        ...(trial.responseWindowMs
          ? {
              timed: {
                limitMs: trial.responseWindowMs,
                elapsedMs: ms,
                endReason: "deadline",
              },
            }
          : {}),
      },
    };
    view = await request<RunView>(
      `${api}/runs/${view.id}/answers?session=student`,
      student,
      payload,
    );
    responses++;
    if (responses === 1)
      assert.deepEqual(
        await request(
          `${api}/runs/${view.id}/answers?session=student`,
          student,
          payload,
        ),
        view,
      );
  }
  assert.equal(responses, 86);
  assert.equal(view.status, "completed");
  const exported = await request<{
    sourceCommit: string;
    runs: {
      id: string;
      sessions: { responses: unknown[]; protocol: unknown }[];
    }[];
  }>(api + "/export?format=json&session=teacher", teacher);
  const run = exported.runs.find((r) => r.id === firstId)!;
  assert.equal(run.sessions.length, 14);
  assert.equal(
    run.sessions.reduce((n, s) => n + s.responses.length, 0),
    86,
  );
  assert.ok(
    !/tokenHash|pinHash|passwordHash|payloadHash/.test(
      JSON.stringify(exported),
    ),
  );
  const csv = await fetch(origin + api + "/export?format=csv&session=teacher", {
    headers: { Cookie: teacher.cookie },
  });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-disposition") ?? "", /attachment/);
  assert.match(await csv.text(), /0012345/);
  await request(
    api + "/export?format=json&session=student",
    student,
    undefined,
    401,
  );
  await request(api + "?session=teacher", teacher, {
    kind: "end",
    lessonId: dashboard.lesson!.id,
    expectedRevision: dashboard.revision,
    requestId: randomUUID(),
  });
  const next = await request<TeacherView>(api + "?session=teacher", teacher);
  assert.equal(next.lesson!.status, "ended");
  assert.equal(
    next.students.find((s) => s.studentId === "0012345")!.answered,
    86,
  );
  await request(base + "/teacher", teacher, { password: "Judgment-Test-2026" });
  await request(api + "?session=teacher", teacher, {
    kind: "start",
    settings: { ...settings, studyIds: ["03-01"] },
    expectedRevision: next.revision,
    requestId: randomUUID(),
  });
  assert.notEqual(
    (await request<StudentView>(api + "?session=student", student)).run!.id,
    firstId,
  );
  console.log(
    JSON.stringify(
      {
        code,
        responses,
        tasks: 14,
        verified: [
          "shared entry and HttpOnly cookies",
          "role isolation and cross-origin rejection",
          "86 saved responses and idempotent retry",
          "translated presentation records",
          "CSV and JSON export",
          "teacher reentry and separate next lesson",
        ],
      },
      null,
      2,
    ),
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
