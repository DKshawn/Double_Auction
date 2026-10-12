import { equilibrium } from "./equilibrium";
import { z } from "zod";
import type {
  StaircaseParameters,
  StudyGeneratorConfig,
  StudySettings,
  UnitPair,
} from "./study-types";

export const DEFAULT_STAIRCASE_PARAMETERS: Readonly<StaircaseParameters> = {
  p: 80,
  K: 8,
  L: 4,
  d: 4,
};
export const DEFAULT_ASSIGNMENT_SEED = 20261012;

export const studyGeneratorConfigSchema = z
  .object({
    kind: z.literal("overlap-staircase"),
    parameters: z
      .object({
        p: z.number().finite(),
        K: z.number().int().min(1),
        L: z.number().int().min(1),
        d: z.number().positive(),
      })
      .strict(),
    seed: z.number().int().min(0).max(0xffffffff),
  })
  .strict();

export function generatedStudySettings(
  generator: StudyGeneratorConfig,
  unitsPerSide: number,
) {
  if (generator.kind !== "overlap-staircase")
    throw new Error("供需プリセットを確認してください。");
  validateAssignmentSeed(generator.seed);
  return generateStaircase(generator.parameters, unitsPerSide).settings;
}

export function validateAssignmentSeed(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("割当シードは0〜4294967295の整数にしてください。");
}

/** Private marginal values/costs, never participant bids. No rounding or clipping. */
export function generateStaircase(
  parameters: StaircaseParameters,
  unitsPerSide = 16,
) {
  const { p, K, L, d } = parameters;
  if (!Number.isInteger(unitsPerSide) || unitsPerSide < 2 || unitsPerSide % 2)
    throw new Error("片側の総単位数は2以上の偶数にしてください。");
  if (!Number.isInteger(K) || K < 1 || !Number.isInteger(L) || L < 1)
    throw new Error("KとLは1以上の整数にしてください。");
  if (K + L > unitsPerSide)
    throw new Error(`K＋Lは片側の総単位数${unitsPerSide}以下にしてください。`);
  if (!Number.isFinite(p) || !Number.isFinite(d) || d <= 0)
    throw new Error("pは有限の数値、dは0より大きい数値にしてください。");
  const demand = Array.from({ length: unitsPerSide }, (_, i) => {
    const k = i + 1;
    return k <= K ? p + d * (K + 1 - k) : k <= K + L ? p : p - d * (k - K - L);
  });
  const supply = Array.from({ length: unitsPerSide }, (_, i) => {
    const k = i + 1;
    return k <= K ? p - d * (K + 1 - k) : k <= K + L ? p : p + d * (k - K - L);
  });
  for (const [side, numbers] of [
    ["demand", demand],
    ["supply", supply],
  ] as const) {
    const index = numbers.findIndex(
      (n) => !Number.isInteger(n) || n < 1 || n > 999,
    );
    if (index === -1) continue;
    const k = index + 1;
    const value = numbers[index];
    const offset = k <= K ? K + 1 - k : k <= K + L ? 0 : k - K - L;
    const sign = (k <= K ? 1 : -1) * (side === "demand" ? 1 : -1);
    const formula = offset
      ? `${p} ${sign > 0 ? "+" : "−"} ${d} × ${offset}`
      : String(p);
    const label = side === "demand" ? "買い手側の価値 D" : "売り手側の費用 S";
    const detail = `${label}(${k})＝${value}円（${formula}＝${value}）。`;
    if (!Number.isInteger(value))
      throw new Error(
        `${detail}整数ではありません。価値・費用は1〜999円の整数で設定してください。p・dを調整してください。丸めは行いません。`,
      );
    const reason =
      value < 1 ? "下限1円を下回っています。" : "上限999円を超えています。";
    const range = "現在の価値・費用の許容範囲は1〜999円です。";
    const hint =
      side === "supply" && k === 1 && value < 1
        ? "p − d × K ≥ 1となるようにp・d・Kを調整してください。LはS(1)に影響しません。"
        : side === "demand" && k === 1 && value > 999
          ? "p ＋ d × K ≤ 999となるようにp・d・Kを調整してください。LはD(1)に影響しません。"
          : "p・d・K・Lを調整してください。";
    throw new Error(
      `${detail}${reason}${range}${value === 0 ? "0円は設定できません。" : ""}${hint}`,
    );
  }
  const perSide = unitsPerSide / 2;
  const pair = (numbers: number[]): UnitPair[] =>
    Array.from({ length: perSide }, (_, i) => [
      numbers[i],
      numbers[i + perSide],
    ]);
  const settings: StudySettings = { values: pair(demand), costs: pair(supply) };
  return { demand, supply, settings, equilibrium: equilibrium(demand, supply) };
}

/** Stable Mulberry32 + Fisher–Yates; arrival order is the input order. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  validateAssignmentSeed(seed);
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function seededStudySeats(capacity: number, seed: number) {
  return seededShuffle(
    Array.from({ length: capacity }, (_, i) => i),
    seed,
  );
}

/** Each kth marginal unit occupies [k-1, k]; consecutive steps only jump vertically. */
export function staircasePoints(units: readonly number[]): [number, number][] {
  return units.flatMap(
    (value, i) =>
      [
        [i, value],
        [i + 1, value],
      ] as [number, number][],
  );
}
