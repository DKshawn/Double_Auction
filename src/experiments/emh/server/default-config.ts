import type { Config } from "../types";

// Keep real experimental conditions out of all public client bundles.
export const DEFAULT_CONFIG: Config = {
  title: "資産市場実験",
  rounds: 6,
  periodSeconds: 240,
  unitSeconds: 30,
  breakSeconds: 60,
  dividends: [
    { a: 216, b: 105 },
    { a: 200, b: 110 },
    { a: 257, b: 83 },
  ],
};
