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
  })
  .strict();
export type EmhSettings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: EmhSettings = {
  initialUnits: 2,
  targetMarketSize: 9,
  typeRatios: [1, 1, 1],
  periodSeconds: 240,
};
export const EXP2_SETTINGS: EmhSettings = {
  initialUnits: 2,
  targetMarketSize: 12,
  typeRatios: [1, 1, 1],
  periodSeconds: 300,
};

// Rooms saved before configurable conditions retain the original protocol.
export function initialUnitsFor(config: { initialUnits?: number }) {
  return config.initialUnits ?? DEFAULT_SETTINGS.initialUnits;
}
