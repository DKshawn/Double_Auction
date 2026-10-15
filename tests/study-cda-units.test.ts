import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PGlite } from "@electric-sql/pglite";
import { studyUnits, studyUnitsPerSide } from "../src/lib/study-config";
import {
  generateStaircase,
  generatedStudySettings,
} from "../src/lib/study-generator";
import { studyRoomConfigSchema } from "../src/lib/study-room-config";
import { studyCommissionError } from "../src/lib/study-commission";
import { newStudy, pptStudySettings } from "../src/lib/server/study";
import {
  executeStudy,
  marketFor,
  marketRound,
  settleStudy,
  stageKey,
  unitLimits,
} from "../src/lib/study-core";
import {
  studyView,
  studyEquilibrium,
  studyMetrics,
} from "../src/lib/study-view";
import { exportData } from "../src/lib/server/export";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { DemoSession } from "../src/lib/demo";
import { TeacherForm } from "../src/components/teacher-form";
import { StudyUnitFields } from "../src/components/study-unit-settings";
import { StudyRoom } from "../src/components/study-room";
import { StudySettingsEditor } from "../src/components/study-settings";
import type { Command, RoomConfig, RoomView } from "../src/lib/types";
import type { Room, Participant, AuditEvent } from "../src/lib/auction-model";
import type { StudyGeneratorConfig } from "../src/lib/study-types";

const config: RoomConfig = {
  title: "CDAの単位数",
  protocol: "institutions-v1",
  markets: 1,
  marketSize: 2,
  capacity: 2,
  rounds: 3,
  duration: 180,
  studyInstitutions: ["cda", "call", "posted"],
  studyPeriods: { cda: 1, call: 1, posted: 1 },
  studyCommission: 3,
};
const generator: StudyGeneratorConfig = {
  kind: "overlap-staircase",
  parameters: { p: 500, K: 2, L: 2, d: 2 },
  seed: 123456,
};

function classroom(units: number) {
  const room: Room = {
    code: "UNITS5",
    config: { ...config, studyCdaUnits: units },
    study: newStudy(1, 2, config.studyInstitutions, units),
    phase: "waiting",
    round: 0,
    version: 1,
    deadline: null,
    remainingMs: 0,
    createdAt: 0,
    teacherTokenHash: "",
    teacherPasswordHash: "",
    teacherFailedLogins: 0,
    teacherLockedUntil: 0,
    participants: [],
    seats: [],
    quotes: [],
    trades: [],
    sequence: 0,
    receipts: [],
  };
  room.study!.settings = {
    values: [Array.from({ length: units }, (_, i) => 200 - i * 10)],
    costs: [Array.from({ length: units }, (_, i) => 20 + i * 10)],
  };
  room.study!.otherSettings = { values: [[110, 100]], costs: [[40, 50]] };
  for (const [seat, role] of (["buyer", "seller"] as const).entries())
    room.participants.push({
      id: randomUUID(),
      seat,
      role,
      alias: role === "buyer" ? "買01" : "売01",
      nickname: seat ? "7654321" : "1234567",
      joinedAt: 0,
      limits: { apple: 0, banana: 0, orange: 0 },
      tokenHash: "",
      pinHash: "",
      failedLogins: 0,
      lockedUntil: 0,
    });
  const events: AuditEvent[] = [];
  let now = 1000;
  const send = (actor: Participant | "teacher", command: Command) =>
    executeStudy(
      room,
      actor,
      {
        requestId: randomUUID(),
        expectedRound:
          actor === "teacher"
            ? room.round
            : marketRound(room, marketFor(room, actor)),
        expectedStage:
          actor === "teacher"
            ? undefined
            : stageKey(room, marketFor(room, actor)),
        command,
      },
      now,
      events,
    );
  const advance = () => {
    now = room.study!.markets[0].deadline!;
    settleStudy(room, now, events);
  };
  return {
    room,
    send,
    advance,
    events,
    buyer: room.participants[0],
    seller: room.participants[1],
    now: () => now,
  };
}

function studentMarkup(view: RoomView) {
  return renderToStaticMarkup(
    createElement(StudyRoom, {
      view,
      now: view.serverTime,
      command: async () => true,
      disabled: false,
      connected: true,
      error: "",
      notice: "",
      retry: () => {},
    }),
  );
}
function currentValues(markup: string) {
  return markup.slice(
    markup.indexOf('class="study-values'),
    markup.indexOf('class="study-private-order'),
  );
}

test("CDA accepts 1–5 integer units; old rooms and the other institutions retain two units", () => {
  assert.equal(studyUnits({}), 2);
  for (const units of [1, 2, 3, 4, 5]) {
    const c = { ...config, studyCdaUnits: units };
    assert.ok(studyRoomConfigSchema.safeParse(c).success);
    assert.equal(studyUnits(c), units);
    assert.equal(studyUnitsPerSide(c), units);
    assert.equal(studyUnits(c, "call"), 2);
    assert.equal(studyUnits(c, "posted"), 2);
  }
  for (const units of [0, 6, 1.5, NaN, Infinity])
    assert.equal(
      studyRoomConfigSchema.safeParse({ ...config, studyCdaUnits: units })
        .success,
      false,
    );
  assert.equal(
    studyRoomConfigSchema.safeParse({
      ...config,
      studyCdaUnits: 5,
      studyInstitutions: ["call"],
      rounds: 1,
    }).success,
    false,
  );
});

test("generated marginal units are conserved and correctly paired for every supported CDA count", () => {
  for (const units of [1, 2, 3, 4, 5]) {
    const count = 7;
    const g = generateStaircase(generator.parameters, count * units, units);
    assert.equal(g.settings.values.length, count);
    assert.equal(g.settings.costs.length, count);
    assert.deepEqual(
      g.settings.values.flat().sort((a, b) => b - a),
      g.demand,
    );
    assert.deepEqual(
      g.settings.costs.flat().sort((a, b) => a - b),
      g.supply,
    );
    for (const [side, numbers] of [
      ["values", g.demand],
      ["costs", g.supply],
    ] as const)
      for (const [i, profile] of g.settings[side].entries())
        assert.deepEqual(
          profile,
          Array.from({ length: units }, (_, j) => numbers[i + j * count]),
        );
    assert.equal(g.equilibrium.quantity, 2);
    assert.equal(g.equilibrium.quantityMax, 4);
  }
  assert.throws(
    () => generateStaircase({ p: 80, K: 8, L: 4, d: 4 }, 8, 1),
    /K＋L/,
  );
  assert.throws(() => generateStaircase(generator.parameters, 7, 3), /人数分/);
  assert.equal(studyEquilibrium(classroom(2).room).quantityMax, 2);
  assert.deepEqual(pptStudySettings(), newStudy(1).settings);
});

for (const units of [1, 2, 3, 4, 5])
  test(`CDA trades exactly ${units} units and advances the displayed value/cost for both roles`, () => {
    const { room, buyer, seller, send, now, events } = classroom(units);
    send("teacher", { type: "start" });
    for (let i = 0; i < units; i++) {
      for (const person of [buyer, seller]) {
        const view = studyView(room, person, now(), "local");
        assert.equal(view.study!.unitsUsed, i);
        const shown = currentValues(studentMarkup(view));
        assert.equal((shown.match(/<b>/g) ?? []).length, 1);
        assert.match(shown, new RegExp(`${i + 1}単位目 / ${units}単位`));
        assert.ok(shown.includes(`${unitLimits(room, person)[i]} 円`));
        for (let future = i + 1; future < units; future++)
          assert.ok(!shown.includes(`${future + 1}単位目`));
      }
      send(seller, { type: "study-quote", price: 100 });
      send(buyer, {
        type: "study-accept",
        orderId: room.study!.markets[0].orders[0].id,
      });
      const trade = room.study!.markets[0].trades.at(-1)!;
      assert.equal(trade.buyerUnit, i + 1);
      assert.equal(trade.sellerUnit, i + 1);
      assert.equal(trade.value, 200 - i * 10);
      assert.equal(trade.cost, 20 + i * 10);
      assert.equal(trade.commission, 3);
    }
    assert.equal(room.study!.markets[0].trades.length, units);
    for (const actor of [buyer, seller]) {
      const markup = studentMarkup(studyView(room, actor, now(), "local"));
      assert.equal((currentValues(markup).match(/<b>/g) ?? []).length, 0);
      assert.ok(
        markup.includes(
          `今期の全${units}単位を${actor.role === "buyer" ? "購入" : "販売"}しました。`,
        ),
      );
      const before = JSON.stringify(room);
      assert.throws(
        () => send(actor, { type: "study-quote", price: 100 }),
        /取引が完了/,
      );
      assert.equal(JSON.stringify(room), before);
    }
    const metric = studyMetrics(room, now())[0];
    assert.equal(metric.commissionPaid, 6 * units);
    const costs = room.study!.settings.costs[0];
    const expected = room.study!.settings.values[0].reduce(
      (sum, value, i) => sum + value - costs[i],
      0,
    );
    assert.equal(metric.surplus, expected);
    assert.equal(metric.efficiency, 100);
    const output = JSON.parse(
      exportData(room, events, now(), "settings").content,
    );
    assert.deepEqual(output.rules.unitsPerInstitution, {
      cda: units,
      call: 2,
      posted: 2,
    });
    assert.equal(output.rules.unitsPerPeriod, units === 2 ? 2 : null);
  });

test("Call and Posted still show and trade two units after a five-unit CDA period, with their own metrics", () => {
  const c = classroom(5);
  c.send("teacher", { type: "start" });
  c.send("teacher", { type: "end-round" });
  c.advance();
  assert.equal(c.room.study!.markets[0].stage, "call");
  for (const actor of [c.buyer, c.seller]) {
    const view = studyView(c.room, actor, c.now(), "local");
    assert.equal(view.study!.unitLimits!.length, 2);
    assert.equal(
      (currentValues(studentMarkup(view)).match(/<b>/g) ?? []).length,
      2,
    );
  }
  assert.throws(
    () => c.send(c.buyer, { type: "call-submit", prices: [110, 100, 90] }),
    /取引可能数/,
  );
  c.send(c.buyer, { type: "call-submit", prices: [110, 100] });
  c.send(c.seller, { type: "call-submit", prices: [40, 50] });
  c.advance();
  const callTrades = c.room.study!.markets[0].trades;
  assert.equal(callTrades.length, 2);
  assert.deepEqual(
    callTrades.map((t) => t.value),
    [110, 100],
  );
  assert.deepEqual(
    callTrades.map((t) => t.cost),
    [40, 50],
  );
  assert.equal(
    studyMetrics(c.room, c.now()).find((m) => m.institution === "call")!
      .efficiency,
    100,
  );
  c.send("teacher", { type: "end-round" });
  c.advance();
  assert.equal(c.room.study!.markets[0].stage, "offer");
  assert.equal(
    studyView(c.room, c.buyer, c.now(), "local").study!.unitsUsed,
    0,
  );
  assert.throws(
    () => c.send(c.seller, { type: "posted-offer", price: 80, quantity: 3 }),
    /数量/,
  );
  c.send(c.seller, { type: "posted-offer", price: 80, quantity: 2 });
  c.advance();
  const offer = c.room.study!.markets[0].offers[0];
  c.send(c.buyer, { type: "posted-buy", offerId: offer.id, quantity: 2 });
  assert.equal(
    c.room.study!.markets[0].trades.filter((t) => t.institution === "posted")
      .length,
    2,
  );
  assert.equal(
    studyMetrics(c.room, c.now()).find((m) => m.institution === "posted")!
      .efficiency,
    100,
  );
  const csv = exportData(c.room, c.events, c.now(), "metrics").content;
  const callRow = csv.split("\n").find((line) => line.includes(',"call",'))!;
  assert.ok(
    callRow.includes(',"120",'),
    "Call benchmark must use its unchanged two-unit surplus",
  );
});

test("teacher settings show an editable CDA count and disabled matching two-unit inputs for other modes", () => {
  const entry = renderToStaticMarkup(
    createElement(TeacherForm, {
      status: { mode: "local", ready: true, keyRequired: false },
      initialConfig: {
        ...config,
        marketSize: 16,
        capacity: 16,
        studyCdaUnits: 5,
        studyCommission: 0,
      },
      conditionPreset: { label: "Default", settings: pptStudySettings() },
    }),
  );
  assert.match(entry, /aria-haspopup="dialog">作成前に詳細を設定/);
  const markup = renderToStaticMarkup(
    createElement(StudyUnitFields, {
      cdaUnits: "5",
      onChange: () => {},
      disabled: false,
    }),
  );
  assert.match(
    markup,
    /aria-label="CDAの1人あたりの単位数"[^>]*min="1"[^>]*max="5"[^>]*value="5"/,
  );
  for (const institution of ["Call Market", "Posted Offer"])
    assert.match(
      markup,
      new RegExp(
        `aria-label="${institution}の1人あたりの単位数"[^>]*disabled=""[^>]*value="2"`,
      ),
    );
  const room = classroom(5).room;
  const view = studyView(room, "teacher", 1000, "local");
  const editor = renderToStaticMarkup(
    createElement(StudySettingsEditor, {
      view,
      command: async () => true,
      disabled: false,
    }),
  );
  assert.equal(view.study!.teacher!.settings.values[0].length, 5);
  assert.doesNotMatch(editor, /条件テンプレート|採用した実験ルール/);
  assert.match(editor, /Call Market・Posted Offerの条件（各自2単位）/);
});

test("CDA unit edits preserve the other institutions, invalidate assignment and lock after start", () => {
  const c = classroom(2);
  delete c.room.study!.otherSettings;
  c.room.study!.lobby = { revision: 0, randomizedAt: 500 };
  const original = structuredClone(c.room.study!.settings);
  const target = generatedStudySettings(generator, 5, 5);
  c.send("teacher", {
    type: "study-settings",
    settings: target,
    unitsPerParticipant: 5,
    expectedRevision: 0,
    generator,
    commission: 0,
  });
  assert.deepEqual(c.room.study!.settings, target);
  assert.deepEqual(c.room.study!.otherSettings, original);
  assert.equal(c.room.study!.lobby!.randomizedAt, null);
  assert.deepEqual(
    c.room.study!.generation!.assignments.map((p) => p.sortedUnits),
    [
      [1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5],
    ],
  );
  assert.throws(() => c.send("teacher", { type: "start" }), /ランダム/);
  c.send("teacher", {
    type: "study-randomize",
    expectedRevision: c.room.study!.lobby!.revision,
  });
  c.send("teacher", { type: "start" });
  const before = JSON.stringify(c.room);
  assert.throws(
    () =>
      c.send("teacher", {
        type: "study-settings",
        settings: original,
        unitsPerParticipant: 2,
        expectedRevision: c.room.study!.revision,
      }),
    /開始前/,
  );
  assert.equal(JSON.stringify(c.room), before);
});

test("Commission cannot turn negative units profitable in either institution schedule", () => {
  const cda = { values: [[200, 180, 160]], costs: [[10, 20, 30]] };
  const other = { values: [[100, 60]], costs: [[50, 64]] };
  assert.equal(studyCommissionError(2, cda), "");
  assert.match(studyCommissionError(2, cda, other), /0〜1/);
  assert.equal(studyCommissionError(1, cda, other), "");
});

test("local persistence stores CDA five-unit and other two-unit schedules, assignments and original Default", async () => {
  const pg = new PGlite();
  const db = localDatabase(pg);
  try {
    await migrate(db);
    let service = new AuctionService(db);
    const cfg = {
      ...config,
      marketSize: 8,
      capacity: 8,
      studyCdaUnits: 5,
      studyCommission: 0,
    };
    const teacher = await service.create(
      cfg,
      "Local-Units-Only-2026",
      "",
      generator,
    );
    for (let i = 0; i < 8; i++)
      await service.join(teacher.code, String(1000000 + i), "1234");
    service = new AuctionService(db);
    let view = await service.view(teacher.code, teacher.token);
    assert.equal(view.config.studyCdaUnits, 5);
    assert.deepEqual(
      view.study!.teacher!.settings,
      generatedStudySettings(generator, 20, 5),
    );
    assert.deepEqual(
      view.study!.teacher!.otherSettings,
      generatedStudySettings(generator, 8),
    );
    assert.deepEqual(
      view.study!.teacher!.preset!.settings,
      pptStudySettings(8),
    );
    const assigned = view.study!.teacher!.generation!.assignments;
    assert.ok(
      assigned.every(
        (p) => p.sortedUnits.length === 5 && p.limits.length === 5,
      ),
    );
    for (const role of ["buyer", "seller"] as const) {
      const numbers = assigned
        .filter((p) => p.role === role)
        .flatMap((p) => p.limits)
        .sort((a, b) => a - b);
      const original = (
        role === "buyer"
          ? view.study!.teacher!.settings.values
          : view.study!.teacher!.settings.costs
      )
        .flat()
        .sort((a, b) => a - b);
      assert.deepEqual(numbers, original);
    }
    const send = async (command: Command) => {
      view = await service.view(teacher.code, teacher.token);
      return service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        command,
      });
    };
    const baseline = structuredClone(view.study!.teacher!.otherSettings);
    await send({
      type: "study-settings",
      unitsPerParticipant: 1,
      settings: generatedStudySettings(generator, 4, 1),
      generator,
      expectedRevision: view.study!.settingsRevision,
    });
    view = await service.view(teacher.code, teacher.token);
    assert.equal(view.config.studyCdaUnits, 1);
    assert.deepEqual(view.study!.teacher!.otherSettings, baseline);
    await send({
      type: "study-randomize",
      expectedRevision: view.study!.lobby!.revision,
    });
    await send({ type: "start" });
    await assert.rejects(
      send({
        type: "study-settings",
        unitsPerParticipant: 5,
        settings: generatedStudySettings(generator, 20, 5),
        generator,
        expectedRevision: view.study!.settingsRevision,
      }),
      /開始前/,
    );
    const bundle = await service.export(teacher.code, teacher.token);
    const data = JSON.parse(
      exportData(bundle.room, bundle.events, bundle.now, "settings").content,
    );
    assert.deepEqual(data.rules.unitsPerInstitution, {
      cda: 1,
      call: 2,
      posted: 2,
    });
    assert.deepEqual(data.otherInstitutionSchedules, baseline);
    assert.equal(data.generation.assignments[0].limits.length, 1);
    view = await service.view(teacher.code, teacher.token);
    assert.equal(view.config.studyCdaUnits, 1);
  } finally {
    await pg.close();
  }
});

test("demo retains two-unit Call and Posted bot offers when CDA is configured to five", async () => {
  const demo = new DemoSession("cda", "buyer", 1000, {
    config: {
      ...config,
      marketSize: 16,
      capacity: 16,
      studyCdaUnits: 5,
      studyCommission: 0,
    },
  });
  assert.equal(await demo.command({ type: "start" }, true), true);
  demo.skipStage();
  demo.advanceTime(8);
  assert.equal(demo.getSnapshot().view.study!.market.institution, "call");
  assert.equal(demo.getSnapshot().view.study!.unitLimits!.length, 2);
  demo.skipStage();
  demo.skipStage();
  demo.skipStage();
  demo.skipStage();
  demo.advanceTime(8);
  assert.equal(demo.getSnapshot().view.study!.market.stage, "offer");
  assert.equal(demo.getSnapshot().view.study!.unitLimits!.length, 2);
  demo.skipStage();
  assert.equal(demo.getSnapshot().view.study!.market.offers.length, 8);
  assert.ok(
    demo.getSnapshot().view.study!.market.offers.every((o) => o.quantity === 2),
  );
});
