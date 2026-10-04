import { createStudy } from "../study-core";
import { DEFAULT_MARKET_SIZE } from "../study-config";
import type { StudySettings } from "../study-types";
export * from "../study-core";

// Formal experiment schedules stay on the server; the public demo uses its own values.
export function newStudy(count: number, marketSize = DEFAULT_MARKET_SIZE) {
  const defaults: StudySettings = {
    values: [
      [120, 104],
      [116, 100],
      [112, 96],
      [108, 92],
      [88, 72],
      [84, 68],
      [80, 64],
      [76, 60],
    ],
    costs: [
      [40, 56],
      [44, 60],
      [48, 64],
      [52, 68],
      [72, 88],
      [76, 92],
      [80, 96],
      [84, 100],
    ],
  };
  const perSide = marketSize / 2;
  // Sample the full original schedule at equal quantiles, repeating profiles for
  // larger groups. At 16 people this is exactly the original eight profiles.
  const resize = (pairs: StudySettings["values"]) =>
    Array.from(
      { length: perSide },
      (_, i) =>
        [...pairs[Math.floor(((i + 0.5) * pairs.length) / perSide)]] as [
          number,
          number,
        ],
    );
  return createStudy(count, {
    values: resize(defaults.values),
    costs: resize(defaults.costs),
  });
}
