import { createStudy } from "../study-core";
import {
  DEFAULT_MARKET_SIZE,
  DEFAULT_STUDY_INSTITUTIONS,
  resizeStudySettings,
  DEFAULT_STUDY_UNITS,
} from "../study-config";
import type { Institution, StudySettings } from "../study-types";
export * from "../study-core";

// Load classroom presets only for teacher previews/rooms; the demo has practice values.
export function pptStudySettings(
  marketSize = DEFAULT_MARKET_SIZE,
  unitsPerParticipant = DEFAULT_STUDY_UNITS,
): StudySettings {
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
  return resizeStudySettings(defaults, marketSize, unitsPerParticipant);
}

export function newStudy(
  count: number,
  marketSize = DEFAULT_MARKET_SIZE,
  institutions: readonly Institution[] = DEFAULT_STUDY_INSTITUTIONS,
  unitsPerParticipant = DEFAULT_STUDY_UNITS,
) {
  const study = createStudy(
    count,
    pptStudySettings(marketSize, unitsPerParticipant),
    institutions,
    unitsPerParticipant === DEFAULT_STUDY_UNITS
      ? undefined
      : pptStudySettings(marketSize),
  );
  study.conditionBasis = {
    settings: pptStudySettings(),
    otherSettings: pptStudySettings(),
  };
  return study;
}
