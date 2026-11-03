import { z } from "zod";

export const MIN_MARKET_SIZE = 3;
export const MAX_MARKET_SIZE = 12;
export const settingsSchema = z
  .object({
    initialUnits: z.number().int().min(1).max(20),
    targetMarketSize: z
      .number()
      .int()
      .min(MIN_MARKET_SIZE)
      .max(MAX_MARKET_SIZE),
    typeRatios: z.tuple([
      z.number().int().min(1).max(100),
      z.number().int().min(1).max(100),
      z.number().int().min(1).max(100),
    ]),
    periodSeconds: z.number().int().min(60).max(1800),
    rounds: z.number().int().min(1).max(12).default(6),
    unitSeconds: z.number().int().min(1).max(1800).default(30),
    breakSeconds: z.number().int().min(1).max(1800).default(60),
  })
  .strict();
export type EmhSettings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: EmhSettings = {
  initialUnits: 2,
  targetMarketSize: 9,
  typeRatios: [1, 1, 1],
  periodSeconds: 240,
  rounds: 6,
  unitSeconds: 30,
  breakSeconds: 60,
};
export const EXP2_SETTINGS: EmhSettings = {
  initialUnits: 2,
  targetMarketSize: 12,
  typeRatios: [1, 1, 1],
  periodSeconds: 300,
  rounds: 6,
  unitSeconds: 30,
  breakSeconds: 60,
};

// Rooms saved before configurable conditions retain the original protocol.
export function initialUnitsFor(config: { initialUnits?: number }) {
  return config.initialUnits ?? DEFAULT_SETTINGS.initialUnits;
}

export function settingsForExperiment(
  input: EmhSettings,
  experiment: "exp1" | "exp2",
): EmhSettings {
  const settings = settingsSchema.parse(input);
  if (experiment === "exp2") {
    if (settings.rounds > 6)
      throw new Error("実験2は1〜6ラウンドで設定してください。");
    return {
      ...EXP2_SETTINGS,
      rounds: settings.rounds,
      periodSeconds: settings.periodSeconds,
      unitSeconds: settings.unitSeconds,
      breakSeconds: settings.breakSeconds,
    };
  }
  return settings;
}
