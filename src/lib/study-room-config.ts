import { z } from "zod";
import {
  MAX_STUDY_MARKETS,
  MAX_STUDY_PARTICIPANTS,
  MAX_STUDY_ROUNDS,
  MAX_STUDY_UNITS,
  studyLayoutError,
  studyMarketSize,
  studyInstitutions,
  studyUnits,
  studyTotalRounds,
} from "./study-config";
import {
  studyInstitutionsSchema,
  studyPeriodsSchema,
  studyTimingSchema,
} from "./study-core";
import { MAX_STAGE_SECONDS } from "./study-timing";
import { studyCommissionSchema } from "./study-commission";

// Room creation and the in-memory demo validate the same experiment settings.
export const studyRoomConfigSchema = z
  .object({
    protocol: z.literal("institutions-v1"),
    studyAdmission: z.literal("flexible").optional(),
    studySetupConfirmed: z.boolean().optional(),
    title: z.string().trim().min(1).max(60),
    markets: z.number().int().min(1).max(MAX_STUDY_MARKETS),
    marketSize: z
      .number()
      .int()
      .min(2)
      .max(MAX_STUDY_PARTICIPANTS)
      .multipleOf(2)
      .optional(),
    capacity: z.number().int().min(2).max(MAX_STUDY_PARTICIPANTS),
    rounds: z.number().int().min(1).max(MAX_STUDY_ROUNDS),
    duration: z.number().int().min(1).max(MAX_STAGE_SECONDS),
    studyTiming: studyTimingSchema.optional(),
    studyPostedMechanism: z.literal("batch-bids-v1").optional(),
    studyInstitutions: studyInstitutionsSchema.optional(),
    studyPeriods: studyPeriodsSchema.optional(),
    studyCommission: studyCommissionSchema.optional(),
    studyCdaUnits: z.number().int().min(1).max(MAX_STUDY_UNITS).optional(),
  })
  .strict()
  .refine(
    (c) => studyInstitutions(c).includes("cda") || studyUnits(c) === 2,
    "Call Market・Posted Offerの単位数は2で固定です。",
  )
  .refine(
    (c) =>
      !studyLayoutError(
        c.markets,
        studyMarketSize(c),
        c.studyAdmission === "flexible",
      ) &&
      c.capacity ===
        (c.studyAdmission === "flexible"
          ? Math.min(MAX_STUDY_PARTICIPANTS, c.markets * studyMarketSize(c))
          : c.markets * studyMarketSize(c)),
    "市場数・1市場の人数・合計人数を確認してください。",
  )
  .refine(
    (c) => c.rounds === studyTotalRounds(c),
    "合計期数は選択した各制度の期数と一致させてください。",
  );
