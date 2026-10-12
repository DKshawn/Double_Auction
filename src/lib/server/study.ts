import { createStudy } from "../study-core";
import {
  DEFAULT_MARKET_SIZE,
  DEFAULT_STUDY_INSTITUTIONS,
  resizeStudySettings,
} from "../study-config";
import type { Institution, StudySettings } from "../study-types";
export * from "../study-core";

// Load classroom presets only for teacher previews/rooms; the demo has practice values.
export function pptStudySettings(
  marketSize = DEFAULT_MARKET_SIZE,
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
  return resizeStudySettings(defaults, marketSize);
}

export function newStudy(
  count: number,
  marketSize = DEFAULT_MARKET_SIZE,
  institutions: readonly Institution[] = DEFAULT_STUDY_INSTITUTIONS,
) {
  return createStudy(count, pptStudySettings(marketSize), institutions);
}
