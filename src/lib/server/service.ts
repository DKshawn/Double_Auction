import { inMarketQueue } from "./market-queue";
import { studyTiming } from "../study-timing";
import {
  studyLayoutError,
  studyMarketId,
  studyMarketSize,
  studyRole,
  studyRoleIndex,
} from "../study-config";
import { timed, timedSync } from "./performance";
import { randomInt, randomUUID } from "node:crypto";
import type { CommandRequest, RoomConfig, RoomView } from "../types";
import {
  authenticate,
  digest,
  equal,
  newToken,
  passwordHash,
  passwordMatches,
} from "./auth";
import { database, databaseTime, type Database } from "./database";
import {
  assemble,
  lockBundle,
  partition,
  readBundle,
  saveBundle,
  writeEvents,
} from "./market-store";
import { execute, settleDeadline, toView } from "./engine";
import { defaultMarketSettings, limitsForSeat } from "./experiment";
import { AuctionError, emit, type AuditEvent, type Room } from "./model";
import {
  marketFor,
  marketRound,
  newStudy,
  settleStudy,
  studyTimingSchema,
  unitLimits,
} from "./study";

type Outcome<T> =
  { value: T; error?: never } | { error: AuctionError; value?: never };

export class AuctionService {
  constructor(private db: Database) {}

  async create(config: RoomConfig, password: string, accessKey: string) {
    if (config.protocol === "institutions-v1") {
      const size = studyMarketSize(config);
      const layoutError = studyLayoutError(config.markets ?? 0, size);
      if (layoutError) throw new AuctionError(layoutError);
      const timing = studyTimingSchema.safeParse(studyTiming(config));
      if (!timing.success)
        throw new AuctionError("各時間は1〜3600秒の整数で設定してください。");
      config = {
        ...config,
        marketSize: size,
        capacity: config.markets! * size,
        rounds: 15,
        duration: timing.data.cdaSeconds,
        studyTiming: timing.data,
      };
    }
    if (process.env.VERCEL && !process.env.TEACHER_ACCESS_KEY)
      throw new AuctionError("管理者による教員用キーの設定が必要です。", 503);
    if (
      process.env.TEACHER_ACCESS_KEY &&
      !equal(accessKey, process.env.TEACHER_ACCESS_KEY)
    )
      throw new AuctionError("教員用キーが正しくありません。", 403);
    const token = newToken();
    const hash = passwordHash(password);
    const seats = Array.from({ length: config.capacity }, (_, i) => i);
    for (let i = seats.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from(
        { length: 6 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
      const saved = await this.db.transaction(async (tx) => {
        const now = await databaseTime(tx);
        const room: Room = {
          ...(config.protocol === "institutions-v1"
            ? { study: newStudy(config.markets!, studyMarketSize(config)) }
            : {}),
          code,
          config,
          marketSettings: defaultMarketSettings(),
          settingsRevision: 0,
          phase: "waiting",
          round: 0,
          version: 1,
          deadline: null,
          remainingMs: config.duration * 1000,
          createdAt: now,
          teacherTokenHash: digest(token),
          teacherPasswordHash: hash,
          teacherFailedLogins: 0,
          teacherLockedUntil: 0,
          participants: [],
          seats,
          quotes: [],
          trades: [],
          sequence: 0,
          receipts: [],
        };
        const events: AuditEvent[] = [];
        emit(room, events, now, "room-created", "teacher", {
          config,
          marketSettings: room.marketSettings,
          ...(room.study
            ? {
                protocol: room.study.protocol,
                settings: room.study.settings,
                orders: room.study.markets.map((m) => ({
                  market: m.id,
                  order: m.order,
                })),
              }
            : {}),
        });
        const inserted = await tx.query(
          "INSERT INTO auction_rooms (code, state) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING RETURNING code",
          [code, JSON.stringify(room)],
        );
        if (!inserted.rows.length) return false;
        await partition(tx, room);
        await writeEvents(tx, code, events);
        return true;
      });
      if (saved) return { code, token };
    }
    throw new AuctionError(
      "ルームの作成に失敗しました。もう一度お試しください。",
      503,
    );
  }

  private async locked<T>(
    code: string,
    fn: (room: Room, now: number, events: AuditEvent[]) => T | Promise<T>,
    scope?: number,
  ): Promise<T> {
    const outcome = await inMarketQueue(this.db, code, scope, () =>
      this.db.transaction(async (tx): Promise<Outcome<T>> => {
        const bundle = await timed("command.lock_bundle", () =>
          lockBundle(tx, code, scope),
        );
        const room = timedSync("state.assemble", () => assemble(bundle, scope));
        const before = JSON.stringify(room);
        const now = bundle.now; // After acquiring the lock: no pre-lock timestamps.
        const events: AuditEvent[] = [];
        settleDeadline(room, now, events);
        let result: Outcome<T>;
        try {
          result = { value: await fn(room, now, events) };
        } catch (error) {
          if (!(error instanceof AuctionError)) throw error;
          result = { error };
        }
        if (JSON.stringify(room) !== before) {
          await timed("command.save", () =>
            saveBundle(tx, bundle, room, events, scope),
          );
        }
        return result;
      }),
    );
    if (outcome.error) throw outcome.error;
    return outcome.value;
  }

  async join(
    code: string,
    nickname: string,
    pin: string,
    currentToken?: string,
  ) {
    return this.locked(code, (room, now, events) => {
      let participant = room.participants.find((p) => p.nickname === nickname);
      let token = newToken();
      if (participant) {
        if (participant.lockedUntil > now)
          throw new AuctionError(
            "再入室の試行回数が多いため、しばらく待ってください。",
            429,
          );
        if (!passwordMatches(pin, participant.pinHash)) {
          participant.failedLogins++;
          if (participant.failedLogins >= 5) {
            participant.lockedUntil = now + 60_000;
            participant.failedLogins = 0;
          }
          throw new AuctionError(
            "同じ名前が使われています。再入室する場合は正しい暗証番号を入力してください。",
            403,
          );
        }
        // Reuse a cookie only for this student, after checking their PIN.
        // A teacher or another student's session must not override the form.
        if (currentToken && equal(digest(currentToken), participant.tokenHash))
          token = currentToken;
        participant.tokenHash = digest(token);
        participant.failedLogins = 0;
        participant.lockedUntil = 0;
        emit(
          room,
          events,
          now,
          "rejoined",
          participant.id,
          room.study ? { market: marketFor(room, participant).id } : {},
          room.study
            ? marketRound(room, marketFor(room, participant))
            : room.round,
        );
      } else {
        if (room.study ? room.phase === "finished" : room.phase !== "waiting")
          throw new AuctionError(
            room.study
              ? "実験は終了しています。記録を確認する場合は以前の名前と暗証番号で再入室してください。"
              : "実験開始後は新しく参加できません。以前の名前と暗証番号で再入室してください。",
            409,
          );
        if (room.participants.length >= room.config.capacity)
          throw new AuctionError("このルームは満員です。", 409);
        const seat = room.seats[room.participants.length];
        const role = room.study
          ? studyRole(room.config, seat)
          : seat < room.config.capacity / 2
            ? "buyer"
            : "seller";
        const number =
          (room.study
            ? studyRoleIndex(room.config, seat)
            : role === "buyer"
              ? seat
              : seat - room.config.capacity / 2) + 1;
        participant = {
          id: randomUUID(),
          alias: `${role === "buyer" ? "買" : "売"}${String(number).padStart(2, "0")}`,
          nickname,
          role,
          seat,
          limits: limitsForSeat(
            seat,
            room.config.capacity,
            room.marketSettings,
          ),
          tokenHash: digest(token),
          pinHash: passwordHash(pin),
          failedLogins: 0,
          lockedUntil: 0,
        };
        room.participants.push(participant);
        if (room.study)
          participant.limits = {
            apple: unitLimits(room, participant)[0],
            banana: 0,
            orange: 0,
          };
        emit(
          room,
          events,
          now,
          "joined",
          participant.id,
          {
            alias: participant.alias,
            role,
            seat,
            limits: participant.limits,
            ...(room.study
              ? {
                  market: studyMarketId(room.config, seat),
                  unitLimits: unitLimits(room, participant),
                }
              : {}),
          },
          room.study
            ? marketRound(room, marketFor(room, participant))
            : room.round,
        );
        if (room.study) settleStudy(room, now, events);
      }
      return { code, token };
    });
  }

  async recoverTeacher(code: string, password: string) {
    return this.locked(code, (room, now, events) => {
      if (room.teacherLockedUntil > now)
        throw new AuctionError(
          "再入室の試行回数が多いため、しばらく待ってください。",
          429,
        );
      if (!passwordMatches(password, room.teacherPasswordHash)) {
        room.teacherFailedLogins++;
        if (room.teacherFailedLogins >= 5) {
          room.teacherLockedUntil = now + 60_000;
          room.teacherFailedLogins = 0;
        }
        throw new AuctionError("教員パスワードが正しくありません。", 403);
      }
      const token = newToken();
      room.teacherTokenHash = digest(token);
      room.teacherFailedLogins = 0;
      room.teacherLockedUntil = 0;
      emit(room, events, now, "teacher-rejoined", "teacher");
      return { code, token };
    });
  }

  async view(code: string, token?: string): Promise<RoomView> {
    const scope = await timed("command.auth_scope", () =>
      this.scope(code, token),
    );
    const bundle = await readBundle(this.db, code, scope);
    const room = timedSync("state.assemble", () => assemble(bundle, scope));
    const actor = authenticate(room, token);
    const now = bundle.now;
    if (
      room.phase === "running" &&
      room.deadline !== null &&
      room.deadline <= now
    ) {
      await this.advance(code, scope);
      return this.view(code, token);
    }
    return timedSync("view.project", () =>
      toView(room, actor, now, this.db.mode),
    );
  }

  private async scope(
    code: string,
    token?: string,
  ): Promise<number | undefined> {
    const result = await this.db.query<{ state: Room }>(
      "SELECT state FROM auction_rooms WHERE code = $1",
      [code],
    );
    if (!result.rows.length)
      throw new AuctionError("ルームが見つかりません。", 404);
    const root = result.rows[0].state;
    const actor = authenticate(root, token);
    if (root.study && !root.storageVersion) {
      await this.locked(code, () => undefined);
      return this.scope(code, token);
    }
    return root.storageVersion && actor !== "teacher"
      ? studyMarketId(root.config, actor.seat)
      : undefined;
  }

  async advance(code: string, scope?: number) {
    // A teacher read must not serialize deadlines in unrelated markets.
    if (!scope) {
      const bundle = await readBundle(this.db, code);
      if (bundle.root.storageVersion) {
        if (bundle.root.phase !== "running") return;
        await Promise.all(
          bundle.markets
            .filter(
              (m) =>
                m.state.deadline !== null && m.state.deadline <= bundle.now,
            )
            .map((m) => this.locked(code, () => undefined, m.market_id)),
        );
        return;
      }
    }
    await this.locked(code, () => undefined, scope);
  }

  async command(
    code: string,
    token: string | undefined,
    request: CommandRequest,
  ) {
    const scope = await timed("command.auth_scope", () =>
      this.scope(code, token),
    );
    await this.locked(
      code,
      (room, now, events) => {
        const actor = authenticate(room, token);
        if (
          actor !== "teacher" &&
          (scope ? room.receipts.length : room.sequence) > 50_000
        )
          throw new AuctionError(
            "操作数の上限に達しました。実験データを保存してください。",
            429,
          );
        // Never persist a partially applied rejected command.
        const candidate = timedSync("command.clone", () =>
          structuredClone(room),
        );
        const commandEvents: AuditEvent[] = [];
        timedSync("command.execute", () =>
          execute(
            candidate,
            actor === "teacher"
              ? actor
              : candidate.participants.find((p) => p.id === actor.id)!,
            request,
            now,
            commandEvents,
          ),
        );
        Object.assign(room, candidate);
        events.push(...commandEvents);
      },
      scope,
    );
    return this.view(code, token);
  }

  async export(code: string, token?: string) {
    // The locked snapshot ensures event log and room state describe the same commit.
    return this.db.transaction(async (tx) => {
      const bundle = await lockBundle(tx, code, undefined, true);
      const room = assemble(bundle);
      if (authenticate(room, token) !== "teacher")
        throw new AuctionError("データ出力は教員のみ利用できます。", 403);
      const now = bundle.now;
      const pendingEvents: AuditEvent[] = [];
      settleDeadline(room, now, pendingEvents);
      if (pendingEvents.length) {
        await saveBundle(tx, bundle, room, pendingEvents);
      }
      const events = await tx.query<{ event: AuditEvent }>(
        `SELECT event FROM (
           SELECT event FROM auction_events WHERE room_code = $1
           UNION ALL SELECT event FROM auction_market_events WHERE room_code = $1
         ) e ORDER BY (event->>'at')::bigint, (event->>'sequence')::int, COALESCE((event->>'scope')::int, 0)`,
        [code],
      );
      return {
        room,
        events: events.rows.map((r) => r.event),
        now,
      };
    });
  }
}

export async function service() {
  return new AuctionService(await database());
}
