import { createStudy } from "../study-core";
export * from "../study-core";

// Formal experiment schedules stay on the server; the public demo uses its own values.
export function newStudy(count: number) {
  return createStudy(count, {
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
  });
}
