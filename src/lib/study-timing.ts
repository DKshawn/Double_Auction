import { STUDY_RULES } from "./study-rules";
import type { Institution, StudyTiming, StudyMarketView } from "./study-types";
import { DEFAULT_STUDY_INSTITUTIONS, studyMarketSize } from "./study-config";
import type { RoomConfig, Phase } from "./types";

export function studyRemainingMs(
  phase: Phase,
  market: Pick<StudyMarketView, "deadline" | "remainingMs">,
  serverNow: number,
) {
  return phase === "running" && market.deadline !== null
    ? Math.max(0, market.deadline - serverNow)
    : market.remainingMs;
}

export function studyCountdownLabel(
  market: Pick<StudyMarketView, "stage" | "round">,
  totalRounds: number,
) {
  if (market.stage === "call") return "次の清算まで";
  if (market.stage === "purchase") return "取引終了まで";
  if (market.stage === "offer") return "価格提示の締切まで";
  if (market.stage === "feedback")
    return market.round === totalRounds ? "実験終了まで" : "次の制度まで";
  if (market.stage === "countdown") return "取引開始まで";
  return "この段階の残り時間";
}

export const postedPurchaseSeconds = (
  config: Pick<RoomConfig, "studyTiming" | "marketSize">,
) =>
  studyTiming(config).purchaseSeconds ??
  (studyTiming(config).buyerSeconds * studyMarketSize(config)) / 2;

export const MAX_STAGE_SECONDS = 3600;
export const DEFAULT_STUDY_TIMING: StudyTiming = {
  cdaSeconds: STUDY_RULES.cdaSeconds,
  callSeconds: STUDY_RULES.callSeconds,
  offerSeconds: STUDY_RULES.offerSeconds,
  buyerSeconds: STUDY_RULES.buyerSeconds,
};
export const STUDY_TIMING_FIELDS = [
  { key: "cdaSeconds", institution: "cda", label: "CDA：1期の取引時間（秒）" },
  {
    key: "callSeconds",
    institution: "call",
    label: "Call Market：1回の注文受付（秒）",
  },
  {
    key: "offerSeconds",
    institution: "posted",
    label: "Posted Offer：売り手の価格提示（秒）",
  },
  {
    key: "buyerSeconds",
    institution: "posted",
    label: "Posted Offer：買い手1人の購入時間（秒）",
  },
  {
    key: "purchaseSeconds",
    institution: "posted",
    label: "Posted Offer：買い手の共通取引時間（秒）",
  },
] as const;

// Saved rooms without timing settings keep their original deadlines.
export const studyTiming = (config: Pick<RoomConfig, "studyTiming">) =>
  config.studyTiming ?? DEFAULT_STUDY_TIMING;

export function studyTimingForInstitutions(
  timing: StudyTiming,
  institutions: readonly Institution[],
) {
  const result = { ...timing };
  for (const { key, institution } of STUDY_TIMING_FIELDS)
    if (!institutions.includes(institution))
      if (key === "purchaseSeconds") delete result.purchaseSeconds;
      else result[key] = DEFAULT_STUDY_TIMING[key];
  return result;
}

export function studyTimingError(
  timing: StudyTiming,
  institutions: readonly Institution[] = DEFAULT_STUDY_INSTITUTIONS,
) {
  return STUDY_TIMING_FIELDS.filter((field) =>
    institutions.includes(field.institution),
  ).some(({ key }) => {
    const value = timing[key];
    if (key === "purchaseSeconds" && value === undefined) return false;
    return !Number.isInteger(value) || value! < 1 || value! > MAX_STAGE_SECONDS;
  })
    ? `各時間は1〜${MAX_STAGE_SECONDS}秒の整数で設定してください。`
    : "";
}
