"use client";

import { useState } from "react";
import { studyCommission } from "@/lib/study-commission";
import { seededStudySeats } from "@/lib/study-generator";
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
}: {
  view: RoomView;
  command: (c: Command) => Promise<boolean>;
  disabled: boolean;
  onApplied: () => void;
}) {
  const teacher = view.study!.teacher!;
  const locked = view.phase !== "waiting" || view.round > 0;
  const marketSize = studyMarketSize(view.config);
  const perSide = marketSize / 2;
  const [unitsDraft, setUnitsDraft] = useState(String(studyUnits(view.config)));
  const unitsPerParticipant = Number(unitsDraft);
  const units = perSide * unitsPerParticipant;
  const unitsError = studyUnitsError(unitsPerParticipant);
  const otherSettings = studyInstitutions(view.config).some((i) => i !== "cda")
    ? (teacher.otherSettings ??
      (unitsPerParticipant !== studyUnits(view.config)
        ? teacher.settings
        : undefined))
    : undefined;
  const [commission, setCommission] = useState(studyCommission(view.config));
  return (
    <details className="study-generator">
      <summary>供需プリセットを生成・プレビュー</summary>
      <p className="field-help">
        候補を生成して確認し、適用ボタンを押した時点で保存します。現在の条件はプレビューだけでは変わりません。
      </p>
      {locked && (
        <p className="callout">
          実験開始後の条件は固定です。プレビューはできますが、適用はできません。
        </p>
      )}
      <StudyUnitFields
        cdaUnits={unitsDraft}
        onChange={setUnitsDraft}
        disabled={disabled || locked}
        cdaEnabled={studyInstitutions(view.config).includes("cda")}
      />
      {unitsError ? (
        <p className="error-message" role="alert">
          {unitsError}
        </p>
      ) : (
        <StudyPresetPicker
          key={unitsPerParticipant}
          existingPreset={
            teacher.preset
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
          commission={commission}
          onCommissionChange={setCommission}
          actionLabel="この条件を確認して適用"
          onConfirm={async (preview, amount) => {
            const applied = await command({
              type: "study-settings",
              settings: preview.settings,
              commission: amount,
              unitsPerParticipant,
              ...(preview.generator ? { generator: preview.generator } : {}),
              expectedRevision: preview.revision,
            });
            if (applied) onApplied();
            return applied;
          }}
          renderAssignments={(preview) => {
            if (!preview.generator) return null;
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
              <details>
                <summary>
                  シード {preview.generator.seed} の学生割当を確認（
                  {rows.length}
                  人入室済み）
                </summary>
                <AssignmentTable rows={rows} />
                <p className="field-help">
                  未入室の学生は入室順に残りの位置へ入ります。適用後、全員がそろったら「学生の割り当て」で確定してください。
                </p>
              </details>
            );
          }}
        />
      )}
      {teacher.generation && (
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
      )}
    </details>
  );
}
