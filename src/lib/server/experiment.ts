import { GOODS, type GoodId } from "../catalog";
import type { Equilibrium } from "../types";

// These schedules must never be imported from a client component.
const BASE = {
  apple: { values: [54, 46, 40, 31, 25, 18], costs: [9, 18, 24, 29, 38, 46] },
  banana: { values: [82, 74, 67, 59, 51, 44], costs: [20, 30, 38, 44, 49, 58] },
  orange: {
    values: [105, 93, 83, 65, 55, 40],
    costs: [35, 52, 69, 71, 84, 94],
  },
} satisfies Record<GoodId, { values: number[]; costs: number[] }>;

export function schedules(capacity: number) {
  return Object.fromEntries(
    GOODS.map(({ id }) => [
      id,
      {
        values: Array.from({ length: capacity / 12 }, () => BASE[id].values)
          .flat()
          .sort((a, b) => b - a),
        costs: Array.from({ length: capacity / 12 }, () => BASE[id].costs)
          .flat()
          .sort((a, b) => a - b),
      },
    ]),
  ) as Record<GoodId, { values: number[]; costs: number[] }>;
}

export function equilibrium(values: number[], costs: number[]): Equilibrium {
  const v = [...values].sort((a, b) => b - a);
  const c = [...costs].sort((a, b) => a - b);
  let quantity = 0;
  let surplus = 0;
  while (quantity < Math.min(v.length, c.length) && v[quantity] > c[quantity]) {
    surplus += v[quantity] - c[quantity];
    quantity++;
  }
  return {
    low: Math.max(c[quantity - 1] ?? 0, v[quantity] ?? 0),
    high: Math.min(v[quantity - 1] ?? Infinity, c[quantity] ?? Infinity),
    quantity,
    surplus,
  };
}

export function limitsForSeat(seat: number, capacity: number) {
  const buyer = seat < capacity / 2;
  const index = (buyer ? seat : seat - capacity / 2) % 6;
  return Object.fromEntries(
    GOODS.map(({ id }) => [id, BASE[id][buyer ? "values" : "costs"][index]]),
  ) as Record<GoodId, number>;
}
