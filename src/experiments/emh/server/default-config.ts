import type { Config } from "../types";
import { DEFAULT_SETTINGS, type Exp2Options } from "../settings";

// Keep real experimental conditions out of all public client bundles.
export const DEFAULT_CONFIG: Config = {
  title: "資産市場実験",
  initialUnits: DEFAULT_SETTINGS.initialUnits,
  rounds: 6,
  periodSeconds: DEFAULT_SETTINGS.periodSeconds,
  unitSeconds: 30,
  breakSeconds: 60,
  dividends: [
    { a: 216, b: 105 },
    { a: 200, b: 110 },
    { a: 257, b: 83 },
  ],
};

export const FORMAL_EXP2_OPTIONS: Exp2Options = {
  emptyUnitsLimit: 2,
  insiderStartRound: 3,
  insiderCountPerType: 2,
  marketCount: null,
  states: {
    prior: [0.35, 0.42, 0.23],
    dividends: [
      [90, 95, 214],
      [52, 232, 115],
      [136, 140, 124],
    ],
  },
};

export const EXP2_CONFIG: Config = {
  title: "資産市場実験 2",
  experiment: "exp2",
  initialUnits: 2,
  rounds: 6,
  periodSeconds: 300,
  unitSeconds: 30,
  breakSeconds: 60,
  dividends: [],
  states: { ...FORMAL_EXP2_OPTIONS.states, outcomes: [] },
};
