import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { RealtimeBroker } from "../src/lib/server/realtime";
import { applyPatch, type RoomPatch } from "../src/lib/room-sync";
import { exportData } from "../src/lib/server/export";
import { commandSchema } from "../src/lib/server/http";
import { lockBundle, saveBundle } from "../src/lib/server/market-store";
import type { Command, RoomView } from "../src/lib/types";
import { DemoSession } from "../src/lib/demo";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyRoom } from "../src/components/study-room";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 8000) {
  const end = Date.now() + timeout;
  while (!check()) {
    assert.ok(Date.now() < end, "lobby update did not arrive");
    await sleep(20);
  }
}

test("classroom lobby persists arrival order, authenticates allocation, pushes regrouping and starts all markets after five seconds", async () => {
  const pg = new PGlite(),
    db = localDatabase(pg);
  const service = new AuctionService(db),
    broker = new RealtimeBroker(db);
  const stops: (() => void)[] = [];
  const views = new Map<string, RoomView>();
  try {
    await migrate(db);
    const teacher = await service.create(
      {
        title: "待機室テスト",
        protocol: "institutions-v1",
        markets: 2,
        marketSize: 4,
        capacity: 8,
        rounds: 15,
        duration: 180,
      },
      "Local-Lobby-Teacher-2026",
      "",
    );
    // Fix the two institution orders so post-allocation isolation is always tested.
    const fixture = await service.export(teacher.code, teacher.token);
    fixture.room.study!.markets[0].order = ["cda", "call", "posted"];
    fixture.room.study!.markets[1].order = ["call", "cda", "posted"];
    await db.transaction(async (tx) => {
      const before = await lockBundle(tx, teacher.code);
      await saveBundle(tx, before, fixture.room, []);
    });
    const send = async (
      token: string,
      command: Command,
      requestId = randomUUID(),
    ) => {
      const view = await service.view(teacher.code, token);
      return service.command(teacher.code, token, {
        requestId,
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        command,
      });
    };
    const watch = async (token: string) =>
      stops.push(
        await broker.subscribe(teacher.code, token, (event) => {
          if (event.type === "snapshot")
            views.set(token, event.data as RoomView);
          else if (event.type === "patch")
            views.set(
              token,
              applyPatch(views.get(token)!, event.data as RoomPatch),
            );
          else if (event.type === "session-error")
            assert.fail(JSON.stringify(event.data));
        }),
      );
    await watch(teacher.token);
    await assert.rejects(send(teacher.token, { type: "start" }), /全員/);
    await assert.rejects(
      send(teacher.token, { type: "study-randomize", expectedRevision: 0 }),
      /全員/,
    );
    const students: { token: string; id: string; nickname: string }[] = [];
    for (let i = 0; i < 8; i++) {
      const nickname = `学生${i + 1}`;
      const { token } = await service.join(teacher.code, nickname, "1234");
      const v = await service.view(teacher.code, token);
      assert.equal(v.study!.market.id, Math.floor(i / 4) + 1);
      assert.equal(
        v.study!.unitLimits,
        null,
        "waiting students must not see provisional values",
      );
      assert.equal(v.study!.teacher, undefined);
      assert.equal(v.phase, "waiting");
      students.push({ token, id: v.me.id, nickname });
      await watch(token);
    }
    await until(() => views.get(teacher.token)?.participantCount === 8);
    assert.deepEqual(
      views
        .get(teacher.token)!
        .study!.teacher!.participants.map((p) => p.joinOrder),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    await assert.rejects(send(teacher.token, { type: "start" }), /ランダム/);
    await assert.rejects(
      send(students[0].token, { type: "study-randomize", expectedRevision: 0 }),
      /教員のみ/,
    );
    const id = randomUUID();
    const allocated = await send(
      teacher.token,
      { type: "study-randomize", expectedRevision: 0 },
      id,
    );
    const duplicate = await send(
      teacher.token,
      { type: "study-randomize", expectedRevision: 0 },
      id,
    );
    assert.deepEqual(
      duplicate.study!.teacher!.participants,
      allocated.study!.teacher!.participants,
    );
    await assert.rejects(
      send(teacher.token, { type: "study-randomize", expectedRevision: 0 }),
      /更新/,
    );
    for (const market of [1, 2]) {
      const people = allocated.study!.teacher!.participants.filter(
        (p) => p.market === market,
      );
      assert.equal(people.length, 4);
      assert.equal(people.filter((p) => p.role === "buyer").length, 2);
      assert.equal(people.filter((p) => p.role === "seller").length, 2);
      assert.equal(new Set(people.map((p) => p.alias)).size, 4);
    }
    await until(() =>
      students.every((s) => views.get(s.token)?.study?.lobby?.revision === 1),
    );
    for (const student of students) {
      const actual = views.get(student.token)!;
      const assignment = allocated.study!.teacher!.participants.find(
        (p) => p.id === student.id,
      )!;
      assert.equal(actual.study!.market.id, assignment.market);
      assert.equal(actual.me.role, assignment.role);
      assert.equal(actual.study!.unitLimits, null);
    }
    const rejoined = await service.join(
      teacher.code,
      students[0].nickname,
      "1234",
      students[0].token,
    );
    assert.equal(rejoined.token, students[0].token);
    const reloaded = await new AuctionService(db).view(
      teacher.code,
      teacher.token,
    );
    assert.deepEqual(reloaded.study!.lobby, allocated.study!.lobby);
    const starting = await send(teacher.token, { type: "start" });
    assert.equal(starting.round, 0);
    const deadlines = starting.study!.teacher!.markets.map((m) => m.deadline);
    assert.equal(new Set(deadlines).size, 1);
    assert.ok(
      starting.study!.teacher!.markets.every((m) => m.stage === "countdown"),
    );
    assert.ok(deadlines[0]! - starting.serverTime > 4500);
    await assert.rejects(
      send(students[0].token, { type: "study-quote", price: 100 }),
      /時間外/,
    );
    await assert.rejects(
      send(teacher.token, { type: "study-randomize", expectedRevision: 1 }),
      /開始前/,
    );
    await assert.rejects(
      send(teacher.token, { type: "start" }),
      /開始できません/,
    );
    await assert.rejects(send(teacher.token, { type: "end-round" }), /進行中/);
    await until(() =>
      students.every(
        (s) => views.get(s.token)?.study?.market.stage === "countdown",
      ),
    );
    for (const student of students)
      assert.ok(views.get(student.token)!.study!.unitLimits);
    await until(() =>
      views
        .get(teacher.token)!
        .study!.teacher!.markets.every((m) => m.round === 1),
    );
    const saved = await service.export(teacher.code, teacher.token);
    assert.equal(
      saved.events.filter((e) => e.type === "participants-randomized").length,
      1,
    );
    const countdown = saved.events.find((e) => e.type === "start-countdown")!;
    assert.equal((countdown.detail.startsAt as number) - countdown.at, 5000);
    assert.ok(
      saved.room.study!.markets.every(
        (m) => m.periods[0].startedAt === deadlines[0],
      ),
    );
    const settings = JSON.parse(
      exportData(saved.room, saved.events, saved.now, "settings").content,
    );
    assert.equal(settings.assignment.revision, 1);
    assert.equal(settings.startCountdownSeconds, 5);
    assert.ok(
      settings.participants.every((p: { joinedAt?: number }) => p.joinedAt),
    );
    // Each subscribed student follows their NEW market without reconnecting.
    const cda = saved.room.study!.markets.find((m) => m.stage === "cda")!;
    assert.ok(cda);
    {
      const buyer = saved.room.participants.find(
        (p) => Math.floor(p.seat / 4) + 1 === cda.id && p.role === "buyer",
      )!;
      await send(students.find((s) => s.id === buyer.id)!.token, {
        type: "study-quote",
        price: 80,
      });
      await until(() =>
        students
          .filter((s) => views.get(s.token)!.study!.market.id === cda.id)
          .every((s) => views.get(s.token)!.study!.market.orders.length === 1),
      );
      assert.ok(
        students
          .filter((s) => views.get(s.token)!.study!.market.id !== cda.id)
          .every((s) => views.get(s.token)!.study!.market.orders.length === 0),
      );
    }
  } finally {
    stops.forEach((stop) => stop());
    await broker.close();
    await pg.close();
  }
});

test("demo and student screens use the lobby; countdown survives pause and trading cannot start early", async () => {
  const demo = new DemoSession("cda", "buyer", 1000, { lobby: true });
  const markup = () =>
    renderToStaticMarkup(
      createElement(StudyRoom, {
        view: demo.getSnapshot().view,
        now: demo.getSnapshot().now,
        command: demo.command,
        disabled: false,
        connected: true,
        error: "",
        notice: "",
        retry: () => {},
        demo: true,
      }),
    );
  assert.match(markup(), /教員による割り当てを待っています/);
  assert.doesNotMatch(markup(), /購入する単位ごとの価値|買いたい価格/);
  demo.toggleTeacher();
  assert.match(markup(), /学生の割り当て/);
  assert.match(markup(), /市場12の学生/);
  assert.match(markup(), /<details[^>]*open=""/);
  assert.equal(await demo.command({ type: "start" }), false);
  assert.equal(
    await demo.command({ type: "study-randomize", expectedRevision: 0 }),
    true,
  );
  demo.toggleTeacher();
  assert.match(markup(), /割り当てが完了しました/);
  assert.equal(await demo.command({ type: "start" }, true), true);
  assert.match(markup(), /まもなく実験が始まります/);
  assert.equal(demo.getSnapshot().view.study!.market.deadline, 6000);
  demo.advanceTime(2);
  assert.equal(await demo.command({ type: "pause" }, true), true);
  assert.equal(demo.getSnapshot().view.study!.market.remainingMs, 3000);
  demo.advanceTime(30);
  assert.equal(demo.getSnapshot().view.round, 0);
  assert.equal(await demo.command({ type: "resume" }, true), true);
  demo.advanceTime(2);
  assert.equal(demo.getSnapshot().view.round, 0);
  demo.advanceTime(1);
  assert.equal(demo.getSnapshot().view.round, 1);
  assert.doesNotMatch(markup(), /study-start-countdown/);
  demo.toggleTeacher();
  assert.doesNotMatch(markup(), /<details[^>]*open=""/);
  assert.equal(
    commandSchema.safeParse({
      requestId: randomUUID(),
      expectedRound: 0,
      command: { type: "study-randomize", expectedRevision: 0 },
    }).success,
    true,
  );
});
