import {
  resizeStudySettings,
  studyInstitutions,
  studyMarketSize,
  studyTemplateSideCount,
  studyUnits,
} from "./study-config";
import { generatedStudySettings } from "./study-generator";
import { INSTITUTIONS } from "./study-rules";
import type { RoomConfig } from "./types";
import type {
  StudyConditions,
  StudyGeneratorConfig,
  StudySchedules,
  StudySettings,
} from "./study-types";

// Each institution retains its own source table so later resizing never samples
// an already reduced schedule. Old rooms continue to use their saved tables.
export function presetStudyConditions(
  config: RoomConfig,
  basis: StudySettings,
  generator?: StudyGeneratorConfig,
): StudyConditions {
  return Object.fromEntries(
    studyInstitutions(config).map((institution) => {
      const units = studyUnits(config, institution);
      try {
        const settings = generator
          ? generatedStudySettings(
              generator,
              studyTemplateSideCount(config) * units,
              units,
            )
          : resizeStudySettings(basis, studyMarketSize(config), units);
        return [
          institution,
          {
            settings,
            basis: structuredClone(basis),
            ...(generator ? { generator: structuredClone(generator) } : {}),
          },
        ];
      } catch (error) {
        throw new Error(
          `${INSTITUTIONS[institution].short}：${error instanceof Error ? error.message : "供需条件を確認してください。"}`,
        );
      }
    }),
  );
}

export function conditionSchedules(
  conditions: StudyConditions,
): StudySchedules {
  return Object.fromEntries(
    Object.entries(conditions).map(([institution, condition]) => [
      institution,
      condition.settings,
    ]),
  );
}
