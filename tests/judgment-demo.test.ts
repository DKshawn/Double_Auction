import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { NextRequest } from "next/server";
import { POST as demo } from "../src/app/api/judgment/demo/route";
import { POST as teacherPreview } from "../src/app/api/judgment/preview/route";
import { studies } from "../src/experiments/judgment/server/core";
import type { PreviewProtocol } from "../src/experiments/judgment/types";

import {
  createTeacherSession,
  TEACHER_SESSION_COOKIE,
} from "../src/lib/server/teacher-session";

const previousKey = process.env.TEACHER_ACCESS_KEY;
before(() => {
  process.env.TEACHER_ACCESS_KEY = "demo-test-teacher-key";
});
after(() => {
  if (previousKey === undefined) delete process.env.TEACHER_ACCESS_KEY;
  else process.env.TEACHER_ACCESS_KEY = previousKey;
});

function request(
  payload: unknown,
  token?: string,
  origin = "https://experiment.test",
) {
  return new NextRequest("https://experiment.test/api/judgment/demo", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(token ? { Cookie: `${TEACHER_SESSION_COOKIE}=${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}
const settings = {
  studyIds: studies.map((study) => study.id),
  randomizeExperiments: false,
  randomizeChoices: true,
};

test("demo requires an unexpired signed teacher session and a configured key", async () => {
  const key = process.env.TEACHER_ACCESS_KEY!;
  const expired = createTeacherSession(key, Date.now() - 24 * 60 * 60 * 1000);
  for (const token of [undefined, "forged", expired]) {
    const response = await demo(request(settings, token));
    assert.equal(response.status, 401);
    assert.equal("protocols" in (await response.json()), false);
  }
  delete process.env.TEACHER_ACCESS_KEY;
  try {
    assert.equal((await demo(request(settings))).status, 503);
    assert.equal((await teacherPreview(request({ settings }))).status, 503);
  } finally {
    process.env.TEACHER_ACCESS_KEY = key;
  }
});

test("a signed-in teacher can generate the full demo catalog", async () => {
  const response = await demo(
    request(settings, createTeacherSession(process.env.TEACHER_ACCESS_KEY!)),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const result = (await response.json()) as { protocols: PreviewProtocol[] };
  assert.deepEqual(Object.keys(result), ["protocols"]);
  assert.deepEqual(
    result.protocols.map((protocol) => protocol.studyId),
    settings.studyIds,
  );
  assert.equal(
    result.protocols.reduce(
      (total, protocol) => total + protocol.trials.length,
      0,
    ),
    86,
  );
});

test("demo access does not remove the existing teacher-preview protection", async () => {
  const response = await teacherPreview(request({ settings }));
  assert.equal(response.status, 401);
});

test("demo rejects unsupported, duplicate or empty studies and room credentials", async () => {
  const token = createTeacherSession(process.env.TEACHER_ACCESS_KEY!);
  for (const studyIds of [[], ["99-99"], [studies[0].id, studies[0].id]]) {
    const response = await demo(request({ ...settings, studyIds }, token));
    assert.equal(response.status, 400);
  }
  const response = await demo(
    request({ ...settings, code: "ABC234", accessKey: "unused" }, token),
  );
  assert.equal(response.status, 400);
});

test("demo keeps the shared same-origin request restriction", async () => {
  const response = await demo(
    request(
      settings,
      createTeacherSession(process.env.TEACHER_ACCESS_KEY!),
      "https://different.test",
    ),
  );
  assert.equal(response.status, 403);
});
