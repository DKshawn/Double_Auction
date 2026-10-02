import type { Participant, Room } from "./auction-model";
import type { Command, Role, RoomView } from "./types";
import type { Institution, StudySettings } from "./study-types";
import { randomUUID } from "./random";
import {
  createStudy,
  executeStudy,
  marketFor,
  marketRound,
  settleStudy,
  stageKey,
  unitLimits,
  unitsUsed,
} from "./study-core";
import { studyView } from "./study-view";

export const DEMO_MARKETS = 12;
export const DEMO_CAPACITY = DEMO_MARKETS * 16;
// Public practice conditions, deliberately separate from the classroom schedules.
export const DEMO_SETTINGS: StudySettings = {
  values: Array.from({ length: 8 }, (_, i) => [160 - i * 8, 140 - i * 8]),
  costs: Array.from({ length: 8 }, (_, i) => [40 + i * 8, 60 + i * 8]),
};
export type DemoSnapshot = {
  view: RoomView;
  now: number;
  role: Role;
  institution: Institution;
  teacher: boolean;
  error: string;
  generation: number;
};

/** In-memory demo only: no cookies, API requests or classroom persistence. */
export class DemoSession {
  private room!: Room;
  private now: number;
  private humanId = "";
  private role: Role;
  private institution: Institution;
  private teacher = false;
  private error = "";
  private generation = 0;
  private botClocks = new Map<number, { nextAt: number; index: number }>();
  private listeners = new Set<() => void>();
  private snapshot!: DemoSnapshot;

  constructor(
    institution: Institution = "cda",
    role: Role = "buyer",
    now = Date.now(),
  ) {
    this.now = now;
    this.role = role;
    this.institution = institution;
    this.reset(institution, role);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;

  private get market() {
    return this.room.study!.markets[0];
  }
  private get human() {
    return this.room.participants.find((p) => p.id === this.humanId)!;
  }
  private get bots() {
    return this.room.participants.filter((p) => p.id !== this.humanId);
  }

  private publish() {
    this.snapshot = {
      view: studyView(
        this.room,
        this.teacher ? "teacher" : this.human,
        this.now,
        "local",
      ),
      now: this.now,
      role: this.role,
      institution: this.institution,
      teacher: this.teacher,
      error: this.error,
      generation: this.generation,
    };
    this.listeners.forEach((listener) => listener());
  }

  reset = (institution = this.institution, role = this.role) => {
    this.institution = institution;
    this.role = role;
    this.error = "";
    this.botClocks.clear();
    this.generation++;
    const study = createStudy(DEMO_MARKETS, DEMO_SETTINGS);
    const firstOrder = [
      institution,
      ...(["cda", "call", "posted"] as const).filter((i) => i !== institution),
    ];
    // Let the human choose market 1's first institution without changing the
    // balanced assignment: each of the six sequences still has two markets.
    const preferred = study.markets.find(
      (market) => market.order.join() === firstOrder.join(),
    )!;
    [study.markets[0].order, preferred.order] = [
      preferred.order,
      study.markets[0].order,
    ];
    for (const market of study.markets)
      this.botClocks.set(market.id, { nextAt: this.now, index: 0 });
    this.room = {
      code: "DEMO",
      study,
      config: {
        title: "ひとりデモ",
        protocol: "institutions-v1",
        markets: DEMO_MARKETS,
        capacity: DEMO_CAPACITY,
        rounds: 15,
        duration: 180,
      },
      phase: "waiting",
      round: 0,
      version: 1,
      deadline: null,
      remainingMs: 0,
      createdAt: this.now,
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
    for (let seat = 0; seat < DEMO_CAPACITY; seat++) {
      const side = seat % 16 < 8 ? "buyer" : "seller";
      const market = Math.floor(seat / 16) + 1;
      const alias = `${side === "buyer" ? "買" : "売"}${String((seat % 8) + 1).padStart(2, "0")}`;
      const human = seat === (role === "buyer" ? 0 : 8);
      const id = randomUUID();
      if (human) this.humanId = id;
      this.room.participants.push({
        id,
        seat,
        role: side,
        alias,
        nickname: human ? "あなた" : `仮想参加者 市場${market}・${alias}`,
        limits: { apple: 0, banana: 0, orange: 0 },
        tokenHash: "",
        pinHash: "",
        failedLogins: 0,
        lockedUntil: 0,
      });
    }
    this.publish();
  };

  toggleTeacher = () => {
    this.teacher = !this.teacher;
    this.error = "";
    this.publish();
  };

  private send(actor: Participant | "teacher", command: Command) {
    // Match the server's transactional behavior: rejected commands cannot partially mutate the room.
    const candidate = structuredClone(this.room);
    this.applyCommand(candidate, actor, command);
    this.room = candidate;
  }

  private applyCommand(
    room: Room,
    actor: Participant | "teacher",
    command: Command,
  ) {
    const person =
      actor === "teacher"
        ? actor
        : room.participants.find((p) => p.id === actor.id)!;
    executeStudy(
      room,
      person,
      {
        requestId: randomUUID(),
        expectedRound:
          person === "teacher"
            ? room.round
            : marketRound(room, marketFor(room, person)),
        expectedStage: stageKey(
          room,
          person === "teacher"
            ? room.study!.markets[0]
            : marketFor(room, person),
        ),
        command,
      },
      this.now,
      [],
    );
    room.version++;
  }

  private sendBot(bot: Participant, command: Command) {
    // Bots build valid commands from the current state, synchronously. They use
    // the same validating engine without copying all 192 participants per order.
    this.applyCommand(this.room, bot, command);
  }

  command = async (command: Command, asTeacher = this.teacher) => {
    this.error = "";
    try {
      this.send(asTeacher ? "teacher" : this.human, command);
      if (command.type === "start") {
        for (const clock of this.botClocks.values()) {
          clock.index = 0;
          clock.nextAt = this.now;
        }
      }
      this.runBots();
      this.publish();
      return true;
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "操作を実行できませんでした。";
      this.publish();
      return false;
    }
  };

  tick = (elapsedMs: number) => {
    if (this.room.phase !== "running") return;
    this.now += Math.max(0, Math.min(1000, elapsedMs));
    settleStudy(this.room, this.now, []);
    this.runBots();
    this.publish();
  };

  skipStage = () => {
    if (this.room.phase !== "running" || this.market.deadline === null) return;
    this.error = "";
    this.submitSealedBots();
    this.advanceTo(this.market.deadline);
    // Leave the next buyer's full ten seconds available after a manual jump.
    this.botClocks.get(this.market.id)!.nextAt = this.now + 2000;
    this.submitSealedBots();
    this.publish();
  };

  // Advance every market through its own deadlines so intermediate Call
  // clearings and Posted Offer purchases still run through the real engine.
  private advanceTo(target: number) {
    while (this.now < target && this.room.phase === "running") {
      this.now = Math.min(target, this.now + 1000);
      settleStudy(this.room, this.now, []);
      if (this.now < target) this.runBots();
    }
  }

  advanceTime = (seconds = 30) => {
    if (this.room.phase !== "running") return;
    this.error = "";
    this.runBots();
    this.advanceTo(this.now + seconds * 1000);
    this.runBots();
    this.publish();
  };

  skipToHuman = () => {
    if (this.room.phase !== "running" || this.role !== "buyer") return;
    if (this.market.stage === "offer") this.skipStage();
    // At most seven preceding buyers, each with at most two purchases and a pass.
    for (let i = 0; i < 24 && this.market.stage === "purchase"; i++) {
      const id = this.market.buyerOrder[this.market.buyerIndex];
      if (id === this.humanId) break;
      this.buyAsBot(this.room.participants.find((p) => p.id === id)!);
    }
    this.botClocks.get(this.market.id)!.nextAt = this.now + 2000;
    this.publish();
  };

  private submitSealedBots() {
    if (this.room.phase !== "running") return;
    for (const bot of this.bots) {
      const market = marketFor(this.room, bot);
      if (!["call", "offer"].includes(market.stage)) continue;
      if (market.submitted.includes(bot.id)) continue;
      const used = unitsUsed(this.room, bot);
      if (used >= 2) continue;
      const limits = unitLimits(this.room, bot);
      if (market.stage === "call") {
        this.sendBot(bot, {
          type: "call-submit",
          prices: limits
            .slice(used)
            .map((limit) => (bot.role === "buyer" ? limit - 12 : limit + 12)),
        });
      } else if (market.stage === "offer" && bot.role === "seller") {
        this.sendBot(bot, {
          type: "posted-offer",
          price: limits[1] + 12,
          quantity: 2 - used,
        });
      }
    }
  }

  private buyAsBot(bot: Participant) {
    if (bot.id === this.humanId) return;
    const used = unitsUsed(this.room, bot);
    const limit = unitLimits(this.room, bot)[used];
    const offer = marketFor(this.room, bot)
      .offers.filter((o) => o.remaining > 0 && o.price <= limit)
      .sort((a, b) => a.price - b.price)[0];
    if (!offer) {
      this.sendBot(bot, { type: "posted-pass" });
      return;
    }
    const quantity =
      used === 0 &&
      offer.remaining >= 2 &&
      offer.price <= unitLimits(this.room, bot)[1]
        ? 2
        : 1;
    this.sendBot(bot, { type: "posted-buy", offerId: offer.id, quantity });
  }

  private runBots() {
    if (this.room.phase !== "running") return;
    this.submitSealedBots();
    for (const id of this.botClocks.keys()) {
      const clock = this.botClocks.get(id)!;
      if (this.now < clock.nextAt) continue;
      clock.nextAt = this.now + 2000;
      const market = this.room.study!.markets.find((m) => m.id === id)!;
      const bots = this.bots.filter((p) => marketFor(this.room, p).id === id);
      if (market.stage === "purchase") {
        const bot = bots.find(
          (p) => p.id === market.buyerOrder[market.buyerIndex],
        );
        if (bot) this.buyAsBot(bot);
      } else if (market.stage === "cda") {
        const lastSide = id === 1 ? this.role : id % 2 ? "buyer" : "seller";
        bots.sort(
          (a, b) => Number(a.role === lastSide) - Number(b.role === lastSide),
        );
        for (let i = 0; i < bots.length; i++) {
          const bot = bots[clock.index++ % bots.length];
          const used = unitsUsed(this.room, bot);
          if (used >= 2) continue;
          const limit = unitLimits(this.room, bot)[used];
          const price = bot.role === "buyer" ? limit - 12 : limit + 12;
          if (
            market.orders.some(
              (o) => o.participantId === bot.id && o.price === price,
            )
          )
            continue;
          this.sendBot(bot, {
            type: "study-quote",
            price,
          });
          break;
        }
      }
    }
  }
}
