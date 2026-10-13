import { z } from "zod";
import type { RoomConfig, Role } from "./types";
import type { StudySettings, StudyTrade } from "./study-types";
import { equilibrium } from "./equilibrium";

export const DEFAULT_STUDY_COMMISSION = 1;
export const MAX_STUDY_COMMISSION = 999;
export const STUDY_COMMISSION_ERROR = `Commissionは0〜${MAX_STUDY_COMMISSION}円の整数で設定してください。`;
export const studyCommissionSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_STUDY_COMMISSION);

// Missing settings and old fills retain the original zero-reward accounting.
export const studyCommission = (config: Pick<RoomConfig, "studyCommission">) =>
  config.studyCommission ?? 0;
export function studyCommissionLimit(settings: StudySettings) {
  const demand = settings.values.flat().sort((a, b) => b - a);
  const supply = settings.costs.flat().sort((a, b) => a - b);
  const index = demand.findIndex((value, i) => supply[i] > value);
  if (index === -1)
    return {
      maximum: MAX_STUDY_COMMISSION,
      firstNegativeUnit: null,
      gap: null,
    };
  const gap = supply[index] - demand[index];
  return {
    // Both counterparties receive c: preserve D(k) - S(k) + 2c < 0.
    maximum: Math.min(MAX_STUDY_COMMISSION, Math.ceil(gap / 2) - 1),
    firstNegativeUnit: index + 1,
    gap,
  };
}

export function studyCommissionError(amount: number, settings?: StudySettings) {
  if (!studyCommissionSchema.safeParse(amount).success)
    return STUDY_COMMISSION_ERROR;
  if (!settings) return "";
  const limit = studyCommissionLimit(settings);
  return amount > limit.maximum
    ? `Commissionは現在の供需条件では0〜${limit.maximum}円の整数にしてください。第${limit.firstNegativeUnit}単位の価値と費用の差は${limit.gap}円です。負の余剰を維持するため、双方の報酬合計（2 × Commission）を${limit.gap}円未満にします。`
    : "";
}

export function studyCommissionEquilibrium(
  settings: StudySettings,
  amount: number,
) {
  return equilibrium(
    settings.values.flat().map((value) => value + amount),
    settings.costs.flat().map((cost) => cost - amount),
  );
}

export const studyUnitProfit = (
  role: Role,
  limit: number,
  price: number,
  commission: number,
) => (role === "buyer" ? limit - price : price - limit) + commission;

export const studyTradeProfit = (trade: StudyTrade, role: Role) =>
  studyUnitProfit(
    role,
    role === "buyer" ? trade.value : trade.cost,
    trade.price,
    trade.commission ?? 0,
  );
