import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuctionError } from "./model";
import { marketSettingsSchema } from "./market-settings";
import { studySettingsSchema, studyTimingSchema } from "./study";
import { studyRoomConfigSchema } from "../study-room-config";
import {
  generatedStudySettings,
  studyGeneratorConfigSchema,
} from "../study-generator";
import { MAX_NICKNAME_LENGTH } from "../participant-config";
import {
  MAX_STUDY_ROUNDS,
  MAX_STUDY_UNITS,
  studyUnits,
  studyUnitsPerSide,
} from "../study-config";
import { studyCommissionSchema } from "../study-commission";
import { MAX_PRICE } from "../price";

export const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};
export const cookieName = (code: string) => `auction_${code}`;
export const tokenFor = (request: NextRequest, code: string) =>
  request.cookies.get(cookieName(code))?.value;

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
  if (Number(request.headers.get("content-length")) > 8192)
    throw new AuctionError("送信内容が大きすぎます。", 413);
  const text = await request.text();
  if (text.length > 8192)
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
) {
  const response = json({ code: result.code });
  response.cookies.set(cookieName(result.code), result.token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: `/api/rooms/${result.code}`,
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

export function failure(error: unknown) {
  if (error instanceof AuctionError)
    return json({ error: error.message }, error.status);
  // Do not log request bodies, credentials, or driver connection strings.
  console.error(
    "Auction request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      error:
        "サーバーに接続できませんでした。設定を確認するか、少し待って再試行してください。",
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
      generatedStudySettings(
        data.generator,
        studyUnitsPerSide(data.config),
        studyUnits(data.config),
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
    expectedRound: z.number().int().min(0).max(MAX_STUDY_ROUNDS),
    expectedStage: z.string().max(50).optional(),
    command: z.discriminatedUnion("type", [
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
          prices: z.array(z.number().int().min(1).max(MAX_PRICE)).min(1).max(2),
        })
        .strict(),
      z
        .object({
          type: z.literal("posted-offer"),
          price: z.number().int().min(1).max(MAX_PRICE),
          quantity: z.number().int().min(1).max(2),
        })
        .strict(),
      z
        .object({
          type: z.literal("posted-bid"),
          price: z.number().int().min(1).max(MAX_PRICE),
          quantity: z.number().int().min(1).max(2),
        })
        .strict(),
      z
        .object({
          type: z.literal("posted-buy"),
          offerId: z.uuid(),
          quantity: z.number().int().min(1).max(2),
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
