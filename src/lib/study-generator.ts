import { equilibrium } from "./equilibrium";
import { isValidPrice, MAX_PRICE } from "./price";
import { z } from "zod";
import type {
  StaircaseParameters,
  StudyGeneratorConfig,
  StudySettings,
  UnitValues,
} from "./study-types";
import { DEFAULT_STUDY_UNITS, studyUnitsError } from "./study-config";

export const DEFAULT_STAIRCASE_PARAMETERS: Readonly<StaircaseParameters> = {
  p: 80,
  K: 8,
  L: 4,
  d: 4,
};
export const DEFAULT_ASSIGNMENT_SEED = 123456;

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
  unitsPerParticipant = DEFAULT_STUDY_UNITS,
) {
  if (generator.kind !== "overlap-staircase")
    throw new Error("供需プリセットを確認してください。");
  validateAssignmentSeed(generator.seed);
  return generateStaircase(
    generator.parameters,
    unitsPerSide,
    unitsPerParticipant,
  ).settings;
}

export function validateAssignmentSeed(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("割当シードは0〜4294967295の整数にしてください。");
}

/** Private marginal values/costs, never participant bids. No rounding or clipping. */
export function generateStaircase(
  parameters: StaircaseParameters,
  unitsPerSide = 16,
  unitsPerParticipant = DEFAULT_STUDY_UNITS,
) {
  const { p, K, L, d } = parameters;
  const unitsError = studyUnitsError(unitsPerParticipant);
  if (unitsError) throw new Error(unitsError);
  if (
    !Number.isInteger(unitsPerSide) ||
    unitsPerSide < unitsPerParticipant ||
    unitsPerSide % unitsPerParticipant
  )
    throw new Error(
      `片側の総単位数は1人あたり${unitsPerParticipant}単位の人数分にしてください。`,
    );
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
    const index = numbers.findIndex((n) => !isValidPrice(n));
    if (index === -1) continue;
    const k = index + 1;
    const value = numbers[index];
    const head = k <= K;
    const overlap = !head && k <= K + L;
    const offset = head ? K + 1 - k : overlap ? 0 : k - K - L;
    const sign = (head ? 1 : -1) * (side === "demand" ? 1 : -1);
    const operator = sign > 0 ? "+" : "−";
    const symbol = side === "demand" ? "D" : "S";
    const branch = head ? "k ≤ K" : overlap ? "K ＜ k ≤ K + L" : "k ＞ K + L";
    const formula = overlap
      ? "p"
      : `p ${operator} d × (${head ? "K + 1 − k" : "k − K − L"})`;
    const substitution = overlap
      ? `${p}`
      : `${p} ${operator} ${d} × (${head ? `${K} + 1 − ${k}` : `${k} − ${K} − ${L}`})＝${p} ${operator} ${d} × ${offset}`;
    const label = side === "demand" ? "買い手側の価値 D" : "売り手側の費用 S";
    const detail = [
      `式（${branch}）：${symbol}(k)＝${formula}。`,
      `代入（k=${k}、p=${p}、K=${K}、L=${L}、d=${d}）：`,
      overlap
        ? `${symbol}(${k})＝p＝${value}。`
        : `${symbol}(${k})＝${substitution}＝${value}。`,
      `必要条件：1 ≤ ${formula} ≤ ${MAX_PRICE}、かつ生成値は整数。`,
    ];
    if (!Number.isInteger(value))
      throw new Error(
        [
          `${label}(${k})＝${value}円。整数ではありません。`,
          ...detail,
          "全単位を整数にするにはp・dを整数にしてください。丸めは行いません。",
        ].join("\n"),
      );
    const reason =
      value < 1
        ? "下限1円を下回っています。"
        : `上限${MAX_PRICE}円を超えています。`;
    const firstUnitCondition =
      k === 1
        ? `第1単位では${symbol}(1)＝p ${operator} d × K。Lは${symbol}(1)に影響しません。`
        : null;
    const largestOffset = Math.max(K, unitsPerSide - K - L);
    const lowP = 1 + d * largestOffset;
    const highP = MAX_PRICE - d * largestOffset;
    const rangeFormula = `全単位の範囲条件（片側の総単位数 N=${unitsPerSide}）：1 + d × max(K, N − K − L) ≤ p ≤ ${MAX_PRICE} − d × max(K, N − K − L)。`;
    const hint =
      lowP <= highP
        ? `現在のK・L・dでは ${lowP} ≤ p ≤ ${highP}。pをこの範囲にするか、d・K・Lを調整してください。`
        : `現在のK・L・dでは ${lowP} ≤ p ≤ ${highP}となり、条件を満たすpはありません。d・K・Lを調整してください。`;
    throw new Error(
      [
        `${label}(${k})＝${value}円。${reason}${value === 0 ? "0円は設定できません。" : ""}`,
        ...detail,
        ...(firstUnitCondition ? [firstUnitCondition] : []),
        rangeFormula,
        hint,
      ].join("\n"),
    );
  }
  const perSide = unitsPerSide / unitsPerParticipant;
  const pair = (numbers: number[]): UnitValues[] =>
    Array.from({ length: perSide }, (_, i) =>
      Array.from(
        { length: unitsPerParticipant },
        (_, unit) => numbers[i + unit * perSide],
      ),
    );
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
