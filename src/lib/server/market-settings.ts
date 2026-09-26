import { z } from "zod";

const points = z.array(z.number().int().min(1).max(999)).length(6);
const market = z.object({ values: points, costs: points }).strict();
export const marketSettingsSchema = z
  .object({ apple: market, banana: market, orange: market })
  .strict();
