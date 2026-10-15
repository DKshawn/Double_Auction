import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest, type NextResponse } from "next/server";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import {
  cookieName,
  loginResponse,
  sessionFor,
  tokenFor,
} from "../src/lib/server/http";
import { roomApiHref, type RoomSession } from "../src/lib/room-session";
import { GET as snapshot } from "../src/app/api/rooms/[code]/route";
import { POST as command } from "../src/app/api/rooms/[code]/commands/route";
import { POST as join } from "../src/app/api/rooms/[code]/join/route";
import { POST as teacherLogin } from "../src/app/api/rooms/[code]/teacher/route";
import { GET as download } from "../src/app/api/rooms/[code]/export/route";
import { GET as events } from "../src/app/api/rooms/[code]/events/route";
import type { RoomView } from "../src/lib/types";

const pg = new PGlite();
const db = localDatabase(pg);
const service = new AuctionService(db);
const globals = globalThis as typeof globalThis & {
  auctionDatabase?: Promise<Database>;
};
const previousDatabase = globals.auctionDatabase;
before(async () => {
  await migrate(db);
  globals.auctionDatabase = Promise.resolve(db);
});
after(async () => {
  globals.auctionDatabase = previousDatabase;
  await pg.close();
});

const password = "Local-session-test-only";
const cookies = (jar: Map<string, string>) =>
  [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
function remember(jar: Map<string, string>, response: NextResponse) {
  for (const cookie of response.cookies.getAll())
    jar.set(cookie.name, cookie.value);
}
function request(path: string, jar: Map<string, string>, data?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      cookie: cookies(jar),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function fixture() {
  const teacher = await service.create(
    {
      title: "同一ブラウザーの役割分離",
      protocol: "institutions-v1",
      markets: 1,
      marketSize: 2,
      capacity: 2,
      rounds: 1,
      duration: 180,
      studyInstitutions: ["cda"],
      studyPeriods: { cda: 1 },
    },
    password,
    "",
  );
  const jar = new Map<string, string>();
  remember(jar, loginResponse(request("/api/rooms", jar), teacher, "teacher"));
  return {
    teacher,
    jar,
    ctx: { params: Promise.resolve({ code: teacher.code }) },
  };
}

test("login cookies have separate role names and retain HttpOnly, Secure, SameSite and room boundaries", () => {
  const code = "ABCD23";
  const jar = new Map<string, string>();
  for (const session of ["teacher", "student"] as const) {
    const response = loginResponse(
      new NextRequest("https://example.test/api/rooms"),
      { code, token: session === "teacher" ? "a".repeat(64) : "b".repeat(64) },
      session,
    );
    const cookie = response.cookies.get(cookieName(code, session))!;
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.path, `/api/rooms/${code}`);
    assert.equal(cookie.maxAge, 14 * 24 * 60 * 60);
    assert.equal(response.cookies.has(cookieName(code)), false);
    remember(jar, response);
  }
  assert.equal(jar.size, 2);
  for (const session of ["teacher", "student"] as const) {
    for (const suffix of ["", "/commands", "/events", "/export"]) {
      const req = request(roomApiHref(code, session, suffix), jar);
      assert.equal(sessionFor(req), session);
      assert.equal(
        tokenFor(req, code),
        session === "teacher" ? "a".repeat(64) : "b".repeat(64),
      );
    }
  }
  assert.equal(
    tokenFor(request(roomApiHref("EFGH23", "teacher"), jar), "EFGH23"),
    undefined,
  );
});

test("missing scoped credentials never borrow the other role or a stale shared cookie", () => {
  const code = "ABCD23";
  for (const present of ["teacher", "student"] as const) {
    const missing: RoomSession = present === "teacher" ? "student" : "teacher";
    const jar = new Map([
      [cookieName(code, present), "a".repeat(64)],
      [cookieName(code), "b".repeat(64)],
    ]);
    assert.equal(
      tokenFor(request(roomApiHref(code, missing), jar), code),
      undefined,
    );
  }
  assert.throws(
    () => sessionFor(request(`/api/rooms/${code}?session=other`, new Map())),
    /役割/,
  );
});

test("teacher and student snapshots, commands, exports and reentry stay isolated in one cookie jar", async () => {
  const { teacher, jar, ctx } = await fixture();
  const code = teacher.code;
  const studentResponse = await join(
    request(`/api/rooms/${code}/join`, jar, {
      nickname: "1234567",
      pin: "2468",
    }),
    ctx,
  );
  assert.equal(studentResponse.status, 200);
  remember(jar, studentResponse);
  assert.equal(jar.get(cookieName(code, "teacher")), teacher.token);
  const studentToken = jar.get(cookieName(code, "student"));
  assert.ok(studentToken);
  async function read(session: RoomSession) {
    const response = await snapshot(
      request(roomApiHref(code, session), jar),
      ctx,
    );
    assert.equal(response.status, 200);
    return (await response.json()) as RoomView;
  }
  assert.equal((await read("teacher")).me.role, "teacher");
  const student = await read("student");
  assert.notEqual(student.me.role, "teacher");
  assert.equal(student.me.nickname, "1234567");
  assert.equal(student.study?.teacher, undefined);

  const settings = {
    requestId: randomUUID(),
    expectedRound: 0,
    command: {
      type: "study-timing",
      expectedRevision: student.study!.settingsRevision,
      timing: {
        cdaSeconds: 120,
        callSeconds: 30,
        offerSeconds: 60,
        buyerSeconds: 10,
      },
    },
  };
  assert.equal(
    (
      await command(
        request(roomApiHref(code, "teacher", "/commands"), jar, settings),
        ctx,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await command(
        request(roomApiHref(code, "student", "/commands"), jar, {
          ...settings,
          requestId: randomUUID(),
        }),
        ctx,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await download(
        request(
          `${roomApiHref(code, "teacher", "/export")}&kind=settings`,
          jar,
        ),
        ctx,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await download(
        request(
          `${roomApiHref(code, "student", "/export")}&kind=settings`,
          jar,
        ),
        ctx,
      )
    ).status,
    403,
  );

  const reentry = await teacherLogin(
    request(`/api/rooms/${code}/teacher`, jar, { password }),
    ctx,
  );
  assert.equal(reentry.status, 200);
  remember(jar, reentry);
  assert.equal(jar.get(cookieName(code, "student")), studentToken);
  assert.equal((await read("student")).me.id, student.me.id);
  assert.equal((await read("teacher")).me.role, "teacher");

  const studentReentry = await join(
    request(`/api/rooms/${code}/join`, jar, {
      nickname: "1234567",
      pin: "2468",
    }),
    ctx,
  );
  assert.equal(studentReentry.status, 200);
  const teacherToken = jar.get(cookieName(code, "teacher"));
  remember(jar, studentReentry);
  assert.equal(jar.get(cookieName(code, "teacher")), teacherToken);
  assert.equal((await read("student")).me.id, student.me.id);
  assert.equal((await read("teacher")).me.role, "teacher");
});

test("legacy sessions migrate on the first matching read and mismatched roles cannot read, command or stream", async () => {
  const { teacher, ctx } = await fixture();
  const code = teacher.code;
  const legacy = new Map([[cookieName(code), teacher.token]]);
  const studentRead = await snapshot(
    request(roomApiHref(code, "student"), legacy),
    ctx,
  );
  assert.equal(studentRead.status, 401);
  assert.equal(studentRead.cookies.has(cookieName(code, "student")), false);
  const response = await snapshot(
    request(roomApiHref(code, "teacher"), legacy),
    ctx,
  );
  assert.equal(response.status, 200);
  assert.equal(
    response.cookies.get(cookieName(code, "teacher"))?.value,
    teacher.token,
  );
  remember(legacy, response);

  const student = await service.join(code, "7654321", "2468");
  const forged = new Map([[cookieName(code, "teacher"), student.token]]);
  assert.equal(
    (await snapshot(request(roomApiHref(code, "teacher"), forged), ctx)).status,
    401,
  );
  assert.equal(
    (
      await events(
        request(roomApiHref(code, "teacher", "/events"), forged),
        ctx,
      )
    ).status,
    401,
  );
  const rejected = await command(
    request(roomApiHref(code, "teacher", "/commands"), forged, {
      requestId: randomUUID(),
      expectedRound: 0,
      command: { type: "finish" },
    }),
    ctx,
  );
  assert.equal(rejected.status, 401);
  assert.equal((await service.view(code, teacher.token)).phase, "waiting");
});

test("a student order and teacher controls both work after sharing the same browser cookies", async () => {
  const teacher = await service.create(
    { title: "共有ブラウザーの注文", capacity: 12, rounds: 1, duration: 180 },
    password,
    "",
  );
  const code = teacher.code;
  const ctx = { params: Promise.resolve({ code }) };
  const jar = new Map<string, string>();
  remember(jar, loginResponse(request("/api/rooms", jar), teacher, "teacher"));
  const firstJoin = await join(
    request(`/api/rooms/${code}/join`, jar, {
      nickname: "注文者",
      pin: "2468",
    }),
    ctx,
  );
  assert.equal(firstJoin.status, 200);
  remember(jar, firstJoin);
  for (let i = 1; i < 12; i++) await service.join(code, `test${i}`, "1357");
  const studentResponse = await snapshot(
    request(roomApiHref(code, "student"), jar),
    ctx,
  );
  const student = (await studentResponse.json()) as RoomView;
  assert.notEqual(student.me.role, "teacher");
  const start = await command(
    request(roomApiHref(code, "teacher", "/commands"), jar, {
      requestId: randomUUID(),
      expectedRound: 0,
      command: { type: "start" },
    }),
    ctx,
  );
  assert.equal(start.status, 200);
  const quote = await command(
    request(roomApiHref(code, "student", "/commands"), jar, {
      requestId: randomUUID(),
      expectedRound: 1,
      command: {
        type: "quote",
        good: "apple",
        price: student.me.limits!.apple,
      },
    }),
    ctx,
  );
  assert.equal(quote.status, 200);
  assert.equal(((await quote.json()) as RoomView).me.id, student.me.id);
  const pause = await command(
    request(roomApiHref(code, "teacher", "/commands"), jar, {
      requestId: randomUUID(),
      expectedRound: 1,
      command: { type: "pause" },
    }),
    ctx,
  );
  assert.equal(pause.status, 200);
  const paused = (await pause.json()) as RoomView;
  assert.equal(paused.me.role, "teacher");
  assert.equal(paused.phase, "paused");
});
