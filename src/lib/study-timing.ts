import { STUDY_RULES } from "./study-rules";
import type { StudyTiming } from "./study-types";
import type { RoomConfig } from "./types";

export const MAX_STAGE_SECONDS = 3600;
export const DEFAULT_STUDY_TIMING: StudyTiming = {
  cdaSeconds: STUDY_RULES.cdaSeconds,
  callSeconds: STUDY_RULES.callSeconds,
  offerSeconds: STUDY_RULES.offerSeconds,
  buyerSeconds: STUDY_RULES.buyerSeconds,
};
export const STUDY_TIMING_FIELDS = [
  { key: "cdaSeconds", label: "CDA：1期の取引時間（秒）" },
  { key: "callSeconds", label: "Call Market：1回の注文受付（秒）" },
  { key: "offerSeconds", label: "Posted Offer：売り手の価格提示（秒）" },
  { key: "buyerSeconds", label: "Posted Offer：買い手1人の購入時間（秒）" },
] as const;

// Saved rooms without timing settings keep their original deadlines.
export const studyTiming = (config: Pick<RoomConfig, "studyTiming">) =>
  config.studyTiming ?? DEFAULT_STUDY_TIMING;

export function studyTimingError(timing: StudyTiming) {
  return STUDY_TIMING_FIELDS.some(
    ({ key }) =>
      !Number.isInteger(timing[key]) ||
      timing[key] < 1 ||
      timing[key] > MAX_STAGE_SECONDS,
  )
    ? `各時間は1〜${MAX_STAGE_SECONDS}秒の整数で設定してください。`
    : "";
}
