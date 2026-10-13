import { z } from "zod";
import { MAX_PRICE } from "../price";

const points = z.array(z.number().int().min(1).max(MAX_PRICE)).length(6);
const market = z.object({ values: points, costs: points }).strict();
export const marketSettingsSchema = z
  .object({ apple: market, banana: market, orange: market })
  .strict();
