"use client";

import { equilibrium } from "@/lib/equilibrium";
import type { Command, RoomView } from "@/lib/types";
import { studyInstitutions } from "@/lib/study-config";
import { studyCommission } from "@/lib/study-commission";
import { StudyPresetGenerator } from "./study-preset-generator";
import { StudyConditionPreview } from "./study-condition-preview";
import { isValidPrice } from "@/lib/price";
import { INSTITUTIONS } from "@/lib/study-rules";

export function StudySettingsEditor({
  view,
  command,
  disabled,
  onConfirmed,
  onDirty,
  confirmDisabled = false,
}: {
  view: RoomView;
  command: (c: Command) => Promise<boolean>;
  disabled: boolean;
  onConfirmed?: () => void;
  onDirty?: () => void;
  confirmDisabled?: boolean;
}) {
  const teacher = view.study!.teacher!;
  const institutions = studyInstitutions(view.config);
  const settings = teacher.settings;
  const commission = studyCommission(view.config);
  const valid =
    [...settings.values, ...settings.costs].every((pair) =>
      pair.every(isValidPrice),
    ) &&
    settings.values.every((p) => p.every((v, i) => i === 0 || v <= p[i - 1])) &&
    settings.costs.every((p) => p.every((v, i) => i === 0 || v >= p[i - 1]));
  const eq = valid
    ? equilibrium(settings.values.flat(), settings.costs.flat())
    : null;
  return (
    <section
      className={onConfirmed ? "study-setup-editor" : "panel study-section"}
      aria-label="供需条件の設定"
    >
      <div className="study-section-heading">
        <div>
          <h2>供需条件の設定</h2>
          <p className="muted">
            全市場・全期で条件を固定します。開始後は変更できません。
          </p>
        </div>
      </div>
      <StudyPresetGenerator
        key={view.study!.settingsRevision}
        view={view}
        command={command}
        disabled={disabled}
        confirmDisabled={confirmDisabled}
        actionLabel={onConfirmed ? "確定して次へ" : "この条件を保存"}
        onDraftChange={onDirty}
        onApplied={onConfirmed}
      />
      {eq && !onConfirmed && (
        <StudyConditionPreview settings={settings} commission={commission} />
      )}
      {!onConfirmed &&
        !teacher.settingsByInstitution &&
        teacher.otherSettings &&
        institutions.some((i) => i !== "cda") && (
          <details className="study-other-conditions">
            <summary>Call Market・Posted Offerの条件（各自2単位）</summary>
            <StudyConditionPreview
              settings={teacher.otherSettings}
              commission={commission}
            />
          </details>
        )}
      {!onConfirmed &&
        teacher.settingsByInstitution &&
        institutions.slice(1).map((institution) => {
          const schedule = teacher.settingsByInstitution![institution];
          return (
            schedule && (
              <details className="study-other-conditions" key={institution}>
                <summary>
                  {INSTITUTIONS[institution].short}の条件（各自
                  {schedule.values[0].length}単位）
                </summary>
                <StudyConditionPreview
                  settings={schedule}
                  commission={commission}
                />
              </details>
            )
          );
        })}
    </section>
  );
}
