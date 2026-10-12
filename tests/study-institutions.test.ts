import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PGlite } from "@electric-sql/pglite";
import { StudyRoom } from "../src/components/study-room";
import { StudyTimingFields } from "../src/components/study-timing-settings";
import { INSTITUTIONS } from "../src/lib/study-rules";
import {
  DEFAULT_STUDY_INSTITUTIONS,
  studyInstitutions,
  studyInstitutionOrders,
} from "../src/lib/study-config";
import {
  DEFAULT_STUDY_TIMING,
  studyTimingError,
  studyTimingForInstitutions,
} from "../src/lib/study-timing";
import type { Institution } from "../src/lib/study-types";
import type { Command, RoomView } from "../src/lib/types";
import {
  localDatabase,
  migrate,
  type Database,
} from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { configSchema } from "../src/lib/server/http";
import { execute, settleDeadline, toView } from "../src/lib/server/engine";
import { newStudy, marketRound, stageKey } from "../src/lib/server/study";
import { lockBundle, saveBundle } from "../src/lib/server/market-store";
import { exportData } from "../src/lib/server/export";
import type { AuditEvent, Participant } from "../src/lib/server/model";

const selections: Institution[][] = [
  ["cda"],
  ["call"],
  ["posted"],
  ["cda", "call"],
  ["cda", "posted"],
  ["call", "posted"],
  ["cda", "call", "posted"],
];
const config = (institutions: Institution[]) => ({
  protocol: "institutions-v1" as const,
  title: "制度選択テスト",
  markets: 1,
  marketSize: 2,
  capacity: 2,
  studyInstitutions: institutions,
  rounds: institutions.length * 5,
  duration: 1,
  studyTiming: {
    cdaSeconds: 1,
    callSeconds: 1,
    offerSeconds: 1,
    buyerSeconds: 1,
  },
});

function render(view: RoomView) {
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

let pg: PGlite, db: Database, service: AuctionService;
before(async () => {
  pg = new PGlite();
  db = localDatabase(pg);
  await migrate(db);
  service = new AuctionService(db);
});
after(async () => {
  await pg.close();
});

test("institution selection rejects empty, duplicate, unknown or mismatched configurations and keeps old rooms at 15 periods", async () => {
  for (const institutions of selections)
    assert.ok(configSchema.safeParse(config(institutions)).success);
  for (const invalid of [
    [],
    ["cda", "cda"],
    ["other"],
    ["cda", "call", "posted", "cda"],
  ]) {
    assert.equal(
      configSchema.safeParse({ ...config(["cda"]), studyInstitutions: invalid })
        .success,
      false,
    );
    await assert.rejects(
      service.create(
        { ...config(["cda"]), studyInstitutions: invalid as Institution[] },
        "Test-Selection-2026",
        "",
      ),
    );
  }
  assert.equal(
    configSchema.safeParse({ ...config(["call"]), rounds: 15 }).success,
    false,
  );
  const old = { ...config([...DEFAULT_STUDY_INSTITUTIONS]) };
  delete (old as Partial<typeof old>).studyInstitutions;
  assert.ok(configSchema.safeParse(old).success);
  assert.deepEqual(studyInstitutions(old), DEFAULT_STUDY_INSTITUTIONS);
  const legacy = await service.create(old, "Test-Selection-2026", "");
  const saved = await service.view(legacy.code, legacy.token);
  assert.equal(saved.config.rounds, 15);
  assert.deepEqual(saved.config.studyInstitutions, DEFAULT_STUDY_INSTITUTIONS);
});

test("every selected combination balances only its permutations, including odd market counts", () => {
  for (const institutions of selections) {
    const permutations = studyInstitutionOrders(institutions).map((order) =>
      order.join(),
    );
    for (const count of [1, 2, 6, 7, 12]) {
      const study = newStudy(count, 2, institutions);
      if (count === 1) assert.deepEqual(study.markets[0].order, institutions);
      const counts = permutations.map(
        (order) => study.markets.filter((m) => m.order.join() === order).length,
      );
      assert.equal(
        counts.reduce((a, b) => a + b, 0),
        count,
      );
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
      assert.ok(
        study.markets.every((m) => m.order.length === institutions.length),
      );
    }
  }
});

test("time settings show and validate only selected institutions, restoring defaults for unused fields", () => {
  const draft = { ...DEFAULT_STUDY_TIMING, cdaSeconds: 0 };
  const normalized = studyTimingForInstitutions(draft, ["posted"]);
  assert.ok(
    configSchema.safeParse({
      ...config(["posted"]),
      duration: normalized.cdaSeconds,
      studyTiming: normalized,
    }).success,
  );
  assert.equal(studyTimingError(draft, ["posted"]), "");
  assert.notEqual(studyTimingError(draft, ["cda"]), "");
  assert.equal(
    studyTimingForInstitutions(draft, ["posted"]).cdaSeconds,
    DEFAULT_STUDY_TIMING.cdaSeconds,
  );
  for (const institutions of selections) {
    const html = renderToStaticMarkup(
      createElement(StudyTimingFields, {
        institutions,
        timing: DEFAULT_STUDY_TIMING,
        onChange: () => {},
      }),
    );
    assert.equal(
      html.includes('name="studyTiming.cdaSeconds"'),
      institutions.includes("cda"),
    );
    assert.equal(
      html.includes('name="studyTiming.callSeconds"'),
      institutions.includes("call"),
    );
    assert.equal(
      html.includes('name="studyTiming.offerSeconds"'),
      institutions.includes("posted"),
    );
    assert.equal(
      html.includes('name="studyTiming.buyerSeconds"'),
      institutions.includes("posted"),
    );
  }
});

for (const institutions of selections)
  test(`${institutions.join(" + ")}: admission, matching, shared feedback, final completion and stored exports`, async () => {
    const teacher = await service.create(
      config(institutions),
      "Test-Selection-2026",
      "",
    );
    const logins = await Promise.all(
      ["学生A", "学生B"].map((name) =>
        service.join(teacher.code, name, "1234"),
      ),
    );
    const sendTeacher = async (command: Command) => {
      const view = await service.view(teacher.code, teacher.token);
      return service.command(teacher.code, teacher.token, {
        requestId: randomUUID(),
        expectedRound: view.round,
        command,
      });
    };
    const waiting = await service.view(teacher.code, logins[0].token);
    const waitingHtml = render(waiting);
    const included = waitingHtml.match(
      /aria-label="本実験で実施する制度"[^>]*>([\s\S]*?)<\/div>/,
    )?.[1];
    assert.ok(included);
    for (const institution of DEFAULT_STUDY_INSTITUTIONS)
      assert.equal(
        included.includes(INSTITUTIONS[institution].short),
        institutions.includes(institution),
      );
    assert.ok(included.includes(`計${institutions.length * 5}期`));
    await sendTeacher({ type: "study-randomize", expectedRevision: 0 });
    await sendTeacher({ type: "start" });
    const starting = await Promise.all(
      logins.map((student) => service.view(teacher.code, student.token)),
    );
    assert.ok(starting.every((v) => v.study!.market.stage === "countdown"));
    assert.equal(starting[0].deadline, starting[1].deadline);

    const { room } = await service.export(teacher.code, teacher.token);
    const market = room.study!.markets[0];
    const buyer = room.participants.find((p) => p.role === "buyer")!;
    const seller = room.participants.find((p) => p.role === "seller")!;
    const events: AuditEvent[] = [];
    let now = market.deadline!;
    settleDeadline(room, now, events);
    const trade = (actor: Participant, command: Command) =>
      execute(
        room,
        actor,
        {
          requestId: randomUUID(),
          expectedRound: marketRound(room, market),
          expectedStage: stageKey(room, market),
          command,
        },
        now,
        events,
      );

    for (let round = 1; round <= room.config.rounds; round++) {
      assert.equal(market.round, round);
      const institution = market.order[Math.floor((round - 1) / 5)];
      assert.ok(institutions.includes(institution));
      now++;
      if (institution === "cda") {
        trade(seller, { type: "study-quote", price: 80 });
        trade(buyer, { type: "study-quote", price: 120 });
        trade(seller, { type: "study-quote", price: 90 });
        trade(buyer, { type: "study-quote", price: 110 });
      } else if (institution === "call") {
        trade(buyer, { type: "call-submit", prices: [120, 110] });
        trade(seller, { type: "call-submit", prices: [80, 90] });
      } else {
        trade(seller, { type: "posted-offer", price: 80, quantity: 2 });
        now = market.deadline!;
        settleDeadline(room, now, events);
        trade(buyer, {
          type: "posted-buy",
          offerId: market.offers[0].id,
          quantity: 2,
        });
      }
      // Finish all Call clearings or the CDA deadline. Posted completes as soon
      // as the only buyer buys both units; this can advance the market immediately.
      while (market.round === round && market.stage !== "feedback") {
        assert.ok(market.deadline);
        now = market.deadline!;
        settleDeadline(room, now, events);
      }
      assert.equal(market.trades.filter((t) => t.round === round).length, 2);
      if (round % 5 === 0) {
        assert.equal(market.stage, "feedback");
        const endedAt = market.periods.at(-1)!.endedAt!;
        assert.equal(market.deadline, endedAt + 8000);
        const views = [buyer, seller].map((p) => toView(room, p, now, "local"));
        assert.ok(
          views.every(
            (v) =>
              v.study!.market.round === round &&
              v.study!.market.stage === "feedback",
          ),
        );
        assert.equal(views[0].deadline, views[1].deadline);
        assert.ok(
          views.every(
            (v) =>
              v.study!.myTrades.filter((t) => t.round === round).length === 2,
          ),
        );
        assert.ok(
          render(views[0]).includes(
            round === room.config.rounds ? "実験終了まで" : "次の制度まで",
          ),
        );
        settleDeadline(room, market.deadline! - 1, events);
        assert.equal(market.stage, "feedback");
        now = market.deadline!;
        settleDeadline(room, now, events);
        if (round < room.config.rounds) {
          assert.equal(market.round, round + 1);
          assert.equal(
            market.periods.at(-1)!.institution,
            market.order[round / 5],
          );
        }
      }
    }
    assert.equal(room.phase, "finished");
    assert.equal(market.stage, "done");
    assert.equal(market.round, institutions.length * 5);
    assert.equal(market.periods.length, institutions.length * 5);
    assert.ok(
      market.periods.every(
        (p) =>
          p.completion === "complete" && institutions.includes(p.institution),
      ),
    );
    assert.equal(
      events.filter((e) => e.type === "feedback-started").length,
      institutions.length,
    );
    const finalRound = market.round;
    settleDeadline(room, now + 100000, events);
    assert.equal(market.round, finalRound);

    await db.transaction(async (tx) => {
      const before = await lockBundle(tx, room.code, undefined, true);
      await saveBundle(tx, before, room, events);
    });
    const final = await service.view(teacher.code, teacher.token);
    assert.equal(final.phase, "finished");
    assert.equal(final.config.rounds, institutions.length * 5);
    assert.deepEqual(final.config.studyInstitutions, institutions);
    const teacherHtml = render(final);
    assert.ok(teacherHtml.includes(`全${final.config.rounds}期`));
    assert.equal(teacherHtml.includes("第11〜15期"), institutions.length === 3);
    for (const omitted of DEFAULT_STUDY_INSTITUTIONS.filter(
      (i) => !institutions.includes(i),
    ))
      assert.equal(teacherHtml.includes(`<option value="${omitted}">`), false);
    const persisted = await service.export(teacher.code, teacher.token);
    const settings = JSON.parse(
      exportData(persisted.room, persisted.events, now, "settings").content,
    );
    assert.equal(settings.rules.periods, final.config.rounds);
    assert.deepEqual(settings.rules.institutions, institutions);
    assert.equal(settings.metrics.length, final.config.rounds);
    assert.equal(settings.markets[0].periods.length, final.config.rounds);
    const tradesCsv = exportData(
      persisted.room,
      persisted.events,
      now,
      "trades",
    ).content;
    assert.equal(
      tradesCsv.trim().split(/\r?\n/).length,
      final.config.rounds * 2 + 1,
    );
  });
