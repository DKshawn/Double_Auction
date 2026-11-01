import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { NextRequest } from "next/server";
import { POST as demo } from "../src/app/api/judgment/demo/route";
import { POST as teacherPreview } from "../src/app/api/judgment/preview/route";
import { studies } from "../src/experiments/judgment/server/core";
import type { PreviewProtocol } from "../src/experiments/judgment/types";

const previousKey = process.env.TEACHER_ACCESS_KEY;
before(() => {
  process.env.TEACHER_ACCESS_KEY = "demo-test-teacher-key";
});
after(() => {
  if (previousKey === undefined) delete process.env.TEACHER_ACCESS_KEY;
  else process.env.TEACHER_ACCESS_KEY = previousKey;
});

function request(payload: unknown, origin = "https://experiment.test") {
  return new NextRequest("https://experiment.test/api/judgment/demo", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(payload),
  });
}
const settings = {
  studyIds: studies.map((study) => study.id),
  randomizeExperiments: false,
  randomizeChoices: true,
};

test("public demo generates the full catalog without a teacher login or session", async () => {
  const response = await demo(request(settings));
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
  assert.equal(response.status, 403);
});

test("demo rejects unsupported, duplicate or empty studies and room credentials", async () => {
  for (const studyIds of [[], ["99-99"], [studies[0].id, studies[0].id]]) {
    const response = await demo(request({ ...settings, studyIds }));
    assert.equal(response.status, 400);
  }
  const response = await demo(
    request({ ...settings, code: "ABC234", accessKey: "unused" }),
  );
  assert.equal(response.status, 400);
});

test("demo keeps the shared same-origin request restriction", async () => {
  const response = await demo(request(settings, "https://different.test"));
  assert.equal(response.status, 403);
});
