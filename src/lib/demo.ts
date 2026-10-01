import type { Participant, Room } from "./auction-model";
import type { Command, Role, RoomView } from "./types";
import type { Institution, StudySettings } from "./study-types";
import { randomUUID } from "./random";
import {
  createStudy,
  executeStudy,
  settleStudy,
  stageKey,
  unitLimits,
  unitsUsed,
} from "./study-core";
import { studyView } from "./study-view";

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
  private nextBotAt = 0;
  private botIndex = 0;
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
    this.botIndex = 0;
    this.nextBotAt = this.now;
    this.generation++;
    const study = createStudy(1, DEMO_SETTINGS);
    study.markets[0].order = [
      institution,
      ...(["cda", "call", "posted"] as const).filter((i) => i !== institution),
    ];
    this.room = {
      code: "DEMO",
      study,
      config: {
        title: "ひとりデモ",
        protocol: "institutions-v1",
        markets: 1,
        capacity: 16,
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
    for (let seat = 0; seat < 16; seat++) {
      const side = seat < 8 ? "buyer" : "seller";
      const alias = `${side === "buyer" ? "買" : "売"}${String((seat % 8) + 1).padStart(2, "0")}`;
      const human = seat === (role === "buyer" ? 0 : 8);
      const id = randomUUID();
      if (human) this.humanId = id;
      this.room.participants.push({
        id,
        seat,
        role: side,
        alias,
        nickname: human ? "あなた" : `仮想参加者 ${alias}`,
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
    const person =
      actor === "teacher"
        ? actor
        : candidate.participants.find((p) => p.id === actor.id)!;
    executeStudy(
      candidate,
      person,
      {
        requestId: randomUUID(),
        expectedRound: candidate.round,
        expectedStage: stageKey(candidate, candidate.study!.markets[0]),
        command,
      },
      this.now,
      [],
    );
    candidate.version++;
    this.room = candidate;
  }

  command = async (command: Command, asTeacher = this.teacher) => {
    this.error = "";
    try {
      this.send(asTeacher ? "teacher" : this.human, command);
      if (command.type === "start") {
        this.botIndex = 0;
        this.nextBotAt = this.now;
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
    this.now = this.market.deadline;
    settleStudy(this.room, this.now, []);
    // Leave the next buyer's full ten seconds available after a manual jump.
    this.nextBotAt = this.now + 2000;
    this.submitSealedBots();
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
    this.nextBotAt = this.now + 2000;
    this.publish();
  };

  private submitSealedBots() {
    if (this.room.phase !== "running") return;
    for (const bot of this.bots) {
      if (this.market.submitted.includes(bot.id)) continue;
      const used = unitsUsed(this.room, bot);
      if (used >= 2) continue;
      const limits = unitLimits(this.room, bot);
      if (this.market.stage === "call") {
        this.send(bot, {
          type: "call-submit",
          prices: limits
            .slice(used)
            .map((limit) => (bot.role === "buyer" ? limit - 12 : limit + 12)),
        });
      } else if (this.market.stage === "offer" && bot.role === "seller") {
        this.send(bot, {
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
    const offer = this.market.offers
      .filter((o) => o.remaining > 0 && o.price <= limit)
      .sort((a, b) => a.price - b.price)[0];
    if (!offer) {
      this.send(bot, { type: "posted-pass" });
      return;
    }
    const quantity =
      used === 0 &&
      offer.remaining >= 2 &&
      offer.price <= unitLimits(this.room, bot)[1]
        ? 2
        : 1;
    this.send(bot, { type: "posted-buy", offerId: offer.id, quantity });
  }

  private runBots() {
    if (this.room.phase !== "running") return;
    this.submitSealedBots();
    if (this.now < this.nextBotAt) return;
    this.nextBotAt = this.now + 2000;
    if (this.market.stage === "purchase") {
      const bot = this.bots.find(
        (p) => p.id === this.market.buyerOrder[this.market.buyerIndex],
      );
      if (bot) this.buyAsBot(bot);
    } else if (this.market.stage === "cda") {
      const bots = this.bots.sort(
        (a, b) => Number(a.role === this.role) - Number(b.role === this.role),
      );
      for (let i = 0; i < bots.length; i++) {
        const bot = bots[this.botIndex++ % bots.length];
        const used = unitsUsed(this.room, bot);
        if (used >= 2) continue;
        const limit = unitLimits(this.room, bot)[used];
        this.send(bot, {
          type: "study-quote",
          price: bot.role === "buyer" ? limit - 12 : limit + 12,
        });
        break;
      }
    }
  }
}
