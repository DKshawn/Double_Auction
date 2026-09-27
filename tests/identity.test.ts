import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";

let pg: PGlite, service: AuctionService;
before(async () => {
  pg = new PGlite();
  const db = localDatabase(pg);
  await migrate(db);
  service = new AuctionService(db);
});
after(async () => {
  await pg.close();
});

const teacherPassword = "identity-test-password";
const createRoom = () =>
  service.create(
    { title: "入室の動作確認", capacity: 12, rounds: 2, duration: 180 },
    teacherPassword,
    "",
  );

test("student login with a teacher cookie selects the student and denies teacher permissions", async () => {
  const teacher = await createRoom();
  const joined = await service.join(
    teacher.code,
    "学生01",
    "246810",
    teacher.token,
  );
  const view = await service.view(teacher.code, joined.token);
  assert.notEqual(view.me.role, "teacher");
  assert.equal(view.me.nickname, "学生01");
  assert.equal(view.teacher, undefined);
  assert.equal(view.participantCount, 1);
  await assert.rejects(service.export(teacher.code, joined.token), /教員のみ/);
  await assert.rejects(
    service.command(teacher.code, joined.token, {
      requestId: randomUUID(),
      expectedRound: 0,
      command: { type: "start" },
    }),
    /教員のみ/,
  );
  const recovered = await service.recoverTeacher(teacher.code, teacherPassword);
  assert.equal(
    (await service.view(teacher.code, recovered.token)).me.role,
    "teacher",
  );
});

test("student login uses the submitted nickname instead of another student's cookie", async () => {
  const teacher = await createRoom();
  const first = await service.join(teacher.code, "学生01", "246810");
  const second = await service.join(
    teacher.code,
    "学生02",
    "135790",
    first.token,
  );
  const secondView = await service.view(teacher.code, second.token);
  assert.equal(secondView.me.nickname, "学生02");
  assert.equal(secondView.participantCount, 2);
  const rejoined = await service.join(
    teacher.code,
    "学生01",
    "246810",
    second.token,
  );
  const firstView = await service.view(teacher.code, rejoined.token);
  assert.equal(firstView.me.nickname, "学生01");
  assert.notEqual(firstView.me.id, secondView.me.id);
  assert.equal(firstView.participantCount, 2);
});

test("student login validates the PIN even with a valid teacher or student cookie", async () => {
  const teacher = await createRoom();
  const student = await service.join(teacher.code, "学生01", "246810");
  for (const cookie of [teacher.token, student.token]) {
    await assert.rejects(
      service.join(teacher.code, "学生01", "999999", cookie),
      /正しい暗証番号/,
    );
  }
  const before = await service.view(teacher.code, student.token);
  const recovered = await service.join(
    teacher.code,
    "学生01",
    "246810",
    teacher.token,
  );
  const after = await service.view(teacher.code, recovered.token);
  assert.equal(after.me.id, before.me.id);
  assert.equal(after.me.role, before.me.role);
  assert.deepEqual(after.me.limits, before.me.limits);
  assert.equal(after.participantCount, 1);
});

test("student login with its own cookie still respects PIN lockout", async () => {
  const teacher = await createRoom();
  const student = await service.join(teacher.code, "学生01", "246810");
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(
      service.join(teacher.code, "学生01", "999999", student.token),
      /正しい暗証番号/,
    );
  }
  await assert.rejects(
    service.join(teacher.code, "学生01", "246810", student.token),
    /試行回数/,
  );
});
