"use client";

import { useState } from "react";
import { seededStudySeats } from "@/lib/study-generator";
import { studyCommission } from "@/lib/study-commission";
import {
  studyMarketId,
  studyMarketSize,
  studyRole,
  studyRoleIndex,
  studyUnits,
  studyInstitutions,
  studyUnitsError,
  resizeStudySettings,
} from "@/lib/study-config";
import type { Command, RoomView } from "@/lib/types";
import type { StudyGeneratedAssignment } from "@/lib/study-types";
import { StudyPresetPicker } from "./study-preset-picker";
import { StudyUnitFields } from "./study-unit-settings";

function AssignmentTable({ rows }: { rows: StudyGeneratedAssignment[] }) {
  return (
    <div className="study-table-wrap">
      <table>
        <thead>
          <tr>
            <th>市場</th>
            <th>役割</th>
            <th>学生名</th>
            <th>対応する単位 k</th>
            {Array.from({ length: rows[0]?.limits.length ?? 0 }, (_, unit) => (
              <th key={unit}>{unit + 1}単位目</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows]
            .sort((a, b) => a.seat - b.seat)
            .map((row) => (
              <tr key={row.seat}>
                <td>{row.market}</td>
                <td>{row.alias}</td>
                <td>{row.nickname}</td>
                <td>{row.sortedUnits.join("・")}</td>
                {row.limits.map((value, unit) => (
                  <td key={unit}>{value}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudyPresetGenerator({
  view,
  command,
  disabled,
  onApplied,
  onDraftChange,
  actionLabel,
  confirmDisabled,
}: {
  view: RoomView;
  command: (c: Command) => Promise<boolean>;
  disabled: boolean;
  onApplied?: () => void;
  onDraftChange?: () => void;
  actionLabel: string;
  confirmDisabled: boolean;
}) {
  const teacher = view.study!.teacher!;
  const locked = view.phase !== "waiting" || view.round > 0;
  const marketSize = studyMarketSize(view.config);
  const perSide = marketSize / 2;
  const [unitsDraft, setUnitsDraft] = useState(String(studyUnits(view.config)));
  const [commission, setCommission] = useState(studyCommission(view.config));
  const unitsPerParticipant = Number(unitsDraft);
  const units = perSide * unitsPerParticipant;
  const unitsError = studyUnitsError(unitsPerParticipant);
  const otherSettings = studyInstitutions(view.config).some((i) => i !== "cda")
    ? (teacher.otherSettings ??
      (unitsPerParticipant !== studyUnits(view.config)
        ? teacher.settings
        : undefined))
    : undefined;
  const savedGeneration = teacher.generation && (
    <div className="study-saved-generation">
      <p className="callout">
        保存済み：カスタム ／ p={teacher.generation.parameters.p}
        ・K={teacher.generation.parameters.K}・L=
        {teacher.generation.parameters.L}
        ・d={teacher.generation.parameters.d} ／ シード{" "}
        {teacher.generation.seed}
      </p>
      <details>
        <summary>
          保存した分配表（
          {teacher.generation.assignmentConfirmedAt === null
            ? "割当の確認待ち"
            : "確定済み"}
          ）
        </summary>
        <AssignmentTable rows={teacher.generation.assignments} />
      </details>
    </div>
  );
  return (
    <section className="study-generator" aria-label="供需プリセット">
      {locked && (
        <p className="callout">
          実験開始後の条件は固定です。プレビューはできますが、適用はできません。
        </p>
      )}
      <StudyPresetPicker
        existingPreset={
          teacher.preset && !unitsError
            ? {
                label: teacher.preset.label,
                settings: resizeStudySettings(
                  teacher.preset.settings,
                  marketSize,
                  unitsPerParticipant,
                ),
              }
            : undefined
        }
        units={units}
        unitsPerParticipant={unitsPerParticipant}
        otherSettings={otherSettings}
        revision={view.study!.settingsRevision}
        initialGenerator={teacher.generation}
        disabled={disabled}
        locked={locked}
        confirmDisabled={confirmDisabled}
        validationError={unitsError}
        renderUnitFields={(fieldsDisabled) => (
          <StudyUnitFields
            cdaUnits={unitsDraft}
            onChange={(value) => {
              setUnitsDraft(value);
              onDraftChange?.();
            }}
            disabled={fieldsDisabled || locked}
            institutions={studyInstitutions(view.config)}
          />
        )}
        commission={commission}
        onCommissionChange={setCommission}
        onDraftChange={onDraftChange}
        actionLabel={actionLabel}
        onConfirm={async (preview, amount) => {
          const applied = await command({
            type: "study-settings",
            settings: preview.settings,
            commission: amount,
            unitsPerParticipant,
            ...(preview.generator ? { generator: preview.generator } : {}),
            expectedRevision: preview.revision,
          });
          if (applied) onApplied?.();
          return applied;
        }}
        renderAssignments={(preview) => {
          if (!preview.generator) return null;
          if (view.study!.lobby?.admission)
            return (
              <>
                <p className="field-help">
                  学生への割り当ては入室締切時の人数で確定します。条件を適用し、締切後の名簿と条件JSONで確認してください。
                </p>
                {savedGeneration}
              </>
            );
          const seats = seededStudySeats(
            view.config.capacity,
            preview.generator.seed,
          );
          const rows: StudyGeneratedAssignment[] = teacher.participants.map(
            (p) => {
              const seat = seats[p.joinOrder - 1];
              const role = studyRole(view.config, seat);
              const index = studyRoleIndex(view.config, seat);
              return {
                participantId: p.id,
                nickname: p.nickname,
                seat,
                market: studyMarketId(view.config, seat),
                role,
                alias: `${role === "buyer" ? "買" : "売"}${String(index + 1).padStart(2, "0")}`,
                sortedUnits: Array.from(
                  { length: unitsPerParticipant },
                  (_, unit) => index + 1 + unit * perSide,
                ),
                limits:
                  preview.settings[role === "buyer" ? "values" : "costs"][
                    index
                  ],
              };
            },
          );
          return (
            <>
              <details>
                <summary>
                  シード {preview.generator.seed} の学生割当を確認（
                  {rows.length}
                  人入室済み）
                </summary>
                <AssignmentTable rows={rows} />
                <p className="field-help">
                  {view.study!.lobby?.admission
                    ? "入室締切後、実際の人数に合わせて割り当てます。条件を変更した場合は「学生の割り当て」で再度確定してください。"
                    : "未入室の学生は入室順に残りの位置へ入ります。適用後、全員がそろったら「学生の割り当て」で確定してください。"}
                </p>
              </details>
              {savedGeneration}
            </>
          );
        }}
      />
    </section>
  );
}
