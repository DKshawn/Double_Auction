import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuctionError } from "./model";
import { interactionSchema } from "./action-log";
import { marketSettingsSchema } from "./market-settings";
import {
  studySettingsSchema,
  studyTimingSchema,
  studyInstitutionsSchema,
  studyPeriodsSchema,
  studyUnitCountsSchema,
} from "./study";
import { studyRoomConfigSchema } from "../study-room-config";
import {
  generatedStudySettings,
  studyGeneratorConfigSchema,
} from "../study-generator";
import { MAX_NICKNAME_LENGTH } from "../participant-config";
import {
  MAX_STUDY_ROUNDS,
  MAX_STUDY_MARKETS,
  MAX_STUDY_UNITS,
  studyUnits,
  studyUnitsPerSide,
  studyInstitutions,
} from "../study-config";
import { studyCommissionSchema } from "../study-commission";
import { MAX_PRICE } from "../price";
import type { RoomSession } from "../room-session";
import type { RoomView } from "../types";

export const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};
// Five-unit schedules for 500 profiles on each side, including all three
// institutions and the shared settings, must fit in one validated command.
export const MAX_JSON_BODY_BYTES = 128 * 1024;
export const cookieName = (code: string, session?: RoomSession) =>
  `auction_${code}${session ? `_${session}` : ""}`;

export function sessionFor(request: NextRequest): RoomSession | undefined {
  const session = request.nextUrl.searchParams.get("session");
  if (session === null) return undefined;
  if (session === "teacher" || session === "student") return session;
  throw new AuctionError("入室する役割が正しくありません。");
}

export function tokenFor(
  request: NextRequest,
  code: string,
  session = sessionFor(request),
) {
  const teacher = request.cookies.get(cookieName(code, "teacher"))?.value;
  const student = request.cookies.get(cookieName(code, "student"))?.value;
  if (session) {
    const token = session === "teacher" ? teacher : student;
    // Once separate sessions exist, never fall back to the other role or to
    // the old shared cookie. A missing role must sign in using that role.
    if (teacher !== undefined || student !== undefined) return token;
  } else if (student !== undefined || teacher !== undefined) {
    return student ?? teacher;
  }
  return request.cookies.get(cookieName(code))?.value;
}

export function codeFor(code: string) {
  const cleaned = code.toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(cleaned))
    throw new AuctionError("ルームコードは 6 文字で入力してください。");
  return cleaned;
}

export async function body<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): Promise<T> {
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      const source = new URL(origin);
      // NextURL normalizes loopback hostnames; Host retains the actual browser
      // origin. Browsers cannot replace Host in a cross-origin request.
      sameOrigin =
        source.host === (request.headers.get("host") || request.nextUrl.host) &&
        source.protocol === request.nextUrl.protocol;
    } catch {
      /* Invalid origins are rejected. */
    }
    if (!sameOrigin)
      throw new AuctionError("この送信元からは操作できません。", 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AuctionError("送信形式が正しくありません。", 415);
  if (Number(request.headers.get("content-length")) > MAX_JSON_BODY_BYTES)
    throw new AuctionError("送信内容が大きすぎます。", 413);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BODY_BYTES)
    throw new AuctionError("送信内容が大きすぎます。", 413);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AuctionError("送信内容を読み取れません。");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // Preserve the generator's precise range/integer diagnosis on creation too.
    const generatorIssue = parsed.error.issues.find(
      (issue) =>
        issue.code === "custom" &&
        issue.path.length === 1 &&
        issue.path[0] === "generator",
    );
    throw new AuctionError(
      generatorIssue?.message ??
        "入力内容を確認してください。価格・人数・文字数が範囲内か確認してください。",
    );
  }
  return parsed.data;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}
export function loginResponse(
  request: NextRequest,
  result: { code: string; token: string },
  session: RoomSession,
) {
  const response = json({ code: result.code });
  setSessionCookie(response, request, result.code, session, result.token);
  return response;
}

function setSessionCookie(
  response: NextResponse,
  request: NextRequest,
  code: string,
  session: RoomSession,
  token: string,
) {
  response.cookies.set(cookieName(code, session), token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: `/api/rooms/${code}`,
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function roomViewResponse(request: NextRequest, view: RoomView) {
  const response = json(view);
  const session = sessionFor(request);
  const token = tokenFor(request, view.code);
  // An authenticated legacy session is promoted on its first scoped read.
  if (session && token && !request.cookies.has(cookieName(view.code, session)))
    setSessionCookie(response, request, view.code, session, token);
  return response;
}

export function failure(error: unknown) {
  if (error instanceof AuctionError)
    return json({ error: error.message, code: error.code }, error.status);
  // Do not log request bodies, credentials, or driver connection strings.
  console.error(
    "Auction request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      error:
        "サーバーに接続できませんでした。設定を確認するか、少し待って再試行してください。",
      code: "SERVER_UNAVAILABLE",
    },
    503,
  );
}

const legacyConfigSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    capacity: z.union([z.literal(12), z.literal(24), z.literal(36)]),
    rounds: z.number().int().min(1).max(12),
    duration: z.number().int().min(30).max(900),
  })
  .strict();
export const joinSchema = z
  .object({
    nickname: z.string().trim().min(1).max(MAX_NICKNAME_LENGTH),
    pin: z.string().regex(/^\d{4}$/),
  })
  .strict();
export const deleteRoomSchema = z
  .object({
    confirmed: z.literal(true),
    accessKey: z.string().max(256).default(""),
  })
  .strict();
export const configSchema = z.union([
  legacyConfigSchema,
  studyRoomConfigSchema,
]);
export const createRoomSchema = z
  .object({
    config: configSchema,
    password: z.string().min(8).max(128),
    accessKey: z.string().max(256).default(""),
    generator: studyGeneratorConfigSchema.optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (!data.generator) return;
    try {
      if (
        !("protocol" in data.config) ||
        data.config.protocol !== "institutions-v1"
      )
        throw new Error("この供需プリセットは制度比較実験で選択してください。");
      for (const institution of studyInstitutions(data.config))
        generatedStudySettings(
          data.generator,
          studyUnitsPerSide(data.config, institution),
          studyUnits(data.config, institution),
        );
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["generator"],
        message:
          error instanceof Error
            ? error.message
            : "生成条件を確認してください。",
      });
    }
  });
const good = z.enum(["apple", "banana", "orange"]);
export const commandSchema = z
  .object({
    requestId: z.uuid(),
    interaction: interactionSchema.optional(),
    expectedRound: z.number().int().min(0).max(MAX_STUDY_ROUNDS),
    expectedStage: z.string().max(50).optional(),
    command: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("study-admission"),
          action: z.enum([
            "open",
            "close",
            "schedule",
            "pause-timer",
            "resume-timer",
            "cancel-timer",
            "configure",
          ]),
          markets: z.number().int().min(1).max(MAX_STUDY_MARKETS).optional(),
          marketMode: z.enum(["auto", "manual"]).optional(),
          seconds: z.number().int().min(5).max(3600).optional(),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-withdraw"),
          participantId: z.string().min(1).max(100),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-program"),
          institutions: studyInstitutionsSchema,
          periods: studyPeriodsSchema,
          timing: studyTimingSchema.optional(),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-commission"),
          commission: studyCommissionSchema,
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-randomize"),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-timing"),
          timing: studyTimingSchema,
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-settings"),
          settings: studySettingsSchema,
          generator: studyGeneratorConfigSchema.optional(),
          commission: studyCommissionSchema.optional(),
          unitsByInstitution: studyUnitCountsSchema.optional(),
          settingsByInstitution: z
            .object({
              cda: studySettingsSchema.optional(),
              call: studySettingsSchema.optional(),
              posted: studySettingsSchema.optional(),
            })
            .strict()
            .optional(),
          unitsPerParticipant: z
            .number()
            .int()
            .min(1)
            .max(MAX_STUDY_UNITS)
            .optional(),
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("study-quote"),
          price: z.number().int().min(1).max(MAX_PRICE),
        })
        .strict(),
      z.object({ type: z.literal("study-cancel") }).strict(),
      z.object({ type: z.literal("study-accept"), orderId: z.uuid() }).strict(),
      z
        .object({
          type: z.literal("call-submit"),
          prices: z
            .array(z.number().int().min(1).max(MAX_PRICE))
            .min(1)
            .max(MAX_STUDY_UNITS),
        })
        .strict(),
      z
        .object({
          type: z.literal("posted-offer"),
          price: z.number().int().min(1).max(MAX_PRICE),
          quantity: z.number().int().min(1).max(MAX_STUDY_UNITS),
        })
        .strict(),
      z
        .object({
          type: z.literal("posted-bid"),
          price: z.number().int().min(1).max(MAX_PRICE),
          quantity: z.number().int().min(1).max(MAX_STUDY_UNITS),
        })
        .strict(),
      z
        .object({
          type: z.literal("posted-buy"),
          offerId: z.uuid(),
          quantity: z.number().int().min(1).max(MAX_STUDY_UNITS),
        })
        .strict(),
      z.object({ type: z.literal("posted-pass") }).strict(),
      z
        .object({
          type: z.literal("update-markets"),
          settings: marketSettingsSchema,
          expectedRevision: z.number().int().min(0),
        })
        .strict(),
      z
        .object({
          type: z.literal("quote"),
          good,
          price: z.number().int().min(1).max(MAX_PRICE),
        })
        .strict(),
      z.object({ type: z.literal("cancel"), good }).strict(),
      z.object({ type: z.literal("accept"), quoteId: z.uuid() }).strict(),
      ...(["start", "pause", "resume", "end-round", "finish"] as const).map(
        (type) => z.object({ type: z.literal(type) }).strict(),
      ),
    ]),
  })
  .strict();
