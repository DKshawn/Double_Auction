import {
  DEFAULT_MARKET_SIZE,
  resizeStudySettings,
  studyInstitutions,
  studyMarketSettings,
  studyMarketSize,
  studyUnits,
} from "./study-config";
import { generatedStudySettings } from "./study-generator";
import { studyCommission, studyCommissionError } from "./study-commission";
import type { RoomConfig } from "./types";
import type { Room } from "./auction-model";
import type { Study } from "./study-core";
import type { StudyAllocationPlan } from "./study-types";

/** One shared plan for the waiting-room preview, authoritative cutoff and exports. */
export function studyAllocationPlan(
  attendance: number,
  requestedMarkets: number,
  mode: "auto" | "manual" = "manual",
  extraBuyer = true,
): StudyAllocationPlan {
  const requested =
    mode === "auto"
      ? Math.max(1, Math.ceil(attendance / DEFAULT_MARKET_SIZE))
      : requestedMarkets;
  const count =
    mode === "auto"
      ? attendance > 0
        ? requested
        : 0
      : Math.min(requested, Math.floor(attendance / 2));
  const layout = Array.from({ length: count }, (_, i) => {
    const size =
      mode === "auto"
        ? Math.min(DEFAULT_MARKET_SIZE, attendance - i * DEFAULT_MARKET_SIZE)
        : Math.floor(attendance / count) + (i < attendance % count ? 1 : 0);
    const buyers = Math.floor(size / 2) + (size % 2 && extraBuyer ? 1 : 0);
    if (size % 2) extraBuyer = !extraBuyer;
    return { buyers, sellers: size - buyers };
  });
  const largest = Math.max(0, ...layout.map((m) => m.buyers + m.sellers));
  return {
    attendance,
    requestedMarkets: requested,
    templateSize: largest ? 2 * Math.ceil(largest / 2) : DEFAULT_MARKET_SIZE,
    layout,
  };
}

export function studyAllocationWaitingMessage(plan: StudyAllocationPlan) {
  const waiting = plan.layout.flatMap((counts, index) =>
    counts.buyers + counts.sellers === 1 ? [index + 1] : [],
  );
  return waiting.length
    ? `市場${waiting.join("・")}は1人のため補充待ちです。あと1人の入室を待つか、市場数を手動で変更してください。`
    : "";
}

export function studyRoomAllocation(
  room: Pick<Room, "config" | "study" | "participants">,
) {
  const admission = room.study?.lobby?.admission;
  if (!admission) return null;
  const plan = studyAllocationPlan(
    room.participants.filter((p) => !p.withdrawnAt).length,
    admission.targetMarkets,
    room.config.studyMarketMode,
    !room.study!.generation || room.study!.generation.seed % 2 === 0,
  );
  if (
    admission.status === "closed" &&
    room.study!.lobby!.randomizedAt !== null &&
    room.config.studyLayout
  )
    plan.layout = room.config.studyLayout;
  // Before anyone arrives, creation conditions are still a provisional preview.
  if (plan.attendance === 0) plan.templateSize = studyMarketSize(room.config);
  return plan;
}

export function studyAllocationConditions(
  config: RoomConfig,
  study: Study,
  templateSize: number,
) {
  const people = templateSize / 2;
  const basis = study.conditionBasis;
  const units = studyUnits(config);
  const settings = study.generation
    ? generatedStudySettings(study.generation, people * units, units)
    : resizeStudySettings(
        basis?.settings ?? study.settings,
        templateSize,
        units,
      );
  const otherSettings =
    (units !== 2 || study.otherSettings) &&
    studyInstitutions(config).some((i) => i !== "cda")
      ? study.otherGeneration
        ? generatedStudySettings(study.otherGeneration, people * 2)
        : resizeStudySettings(
            basis?.otherSettings ??
              study.otherSettings ??
              basis?.settings ??
              study.settings,
            templateSize,
            2,
          )
      : undefined;
  return { settings, ...(otherSettings ? { otherSettings } : {}) };
}

export function studyAllocationConditionError(
  config: RoomConfig,
  conditions: ReturnType<typeof studyAllocationConditions>,
  plan: StudyAllocationPlan,
) {
  let error = studyCommissionError(
    studyCommission(config),
    conditions.settings,
    conditions.otherSettings,
  );
  const actualConfig = { ...config, studyLayout: plan.layout };
  for (const [i, counts] of plan.layout.entries()) {
    if (error) break;
    if (!counts.buyers || !counts.sellers) continue;
    error = studyCommissionError(
      studyCommission(config),
      studyMarketSettings(actualConfig, conditions.settings, i + 1),
      conditions.otherSettings
        ? studyMarketSettings(actualConfig, conditions.otherSettings, i + 1)
        : undefined,
    );
    if (error) error = `市場${i + 1}：${error}`;
  }
  return error;
}

export function studyAllocationPreview(
  room: Pick<Room, "config" | "study" | "participants">,
) {
  const plan = studyRoomAllocation(room);
  if (!plan) return null;
  try {
    const conditions = studyAllocationConditions(
      room.config,
      room.study!,
      plan.templateSize,
    );
    const error = studyAllocationConditionError(room.config, conditions, plan);
    return { ...plan, ...(error ? { error } : {}) };
  } catch (error) {
    return {
      ...plan,
      error: `最大市場${Math.max(0, ...plan.layout.map((m) => m.buyers + m.sellers))}人に合わせた${plan.templateSize}人の供需テンプレート：${error instanceof Error ? error.message : "条件を確認してください。"} パラメータを再設定してプレビューを確認してください。`,
    };
  }
}
