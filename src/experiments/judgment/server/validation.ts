import { z } from "zod";
export const settingsSchema = z
  .object({
    studyIds: z
      .array(z.string().regex(/^\d{2}-\d{2}$/))
      .min(1)
      .max(14),
    randomizeExperiments: z.boolean().default(false),
    randomizeChoices: z.boolean().default(false),
  })
  .strict();
export const createSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    password: z.string().min(8).max(128),
    accessKey: z.string().max(256).default(""),
    settings: settingsSchema,
  })
  .strict();
export const previewSchema = z
  .object({
    settings: settingsSchema,
    accessKey: z.string().max(256).default(""),
  })
  .strict();
export const commandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("start"),
      requestId: z.uuid(),
      expectedRevision: z.number().int().min(0),
      settings: settingsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("end"),
      requestId: z.uuid(),
      expectedRevision: z.number().int().min(0),
      lessonId: z.uuid(),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const submissionSchema = z
  .object({
    trialIndex: z.number().int().min(0).max(1000),
    trialId: z.string().min(1).max(100),
    submissionId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
    answer: z.record(z.string(), z.unknown()),
    metrics: z.record(z.string(), z.unknown()),
  })
  .strict();
