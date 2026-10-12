"use client";

import { seededStudySeats } from "@/lib/study-generator";
import {
  studyMarketId,
  studyMarketSize,
  studyRole,
  studyRoleIndex,
} from "@/lib/study-config";
import type { Command, RoomView } from "@/lib/types";
import type { StudyGeneratedAssignment } from "@/lib/study-types";
import { StudyPresetPicker } from "./study-preset-picker";

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
            <th>1単位目</th>
            <th>2単位目</th>
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
                <td>{row.limits[0]}</td>
                <td>{row.limits[1]}</td>
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
  const units = studyMarketSize(view.config);
  const perSide = units / 2;
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
      <StudyPresetPicker
        existingPreset={teacher.preset}
        units={units}
        revision={view.study!.settingsRevision}
        initialGenerator={teacher.generation}
        disabled={disabled}
        locked={locked}
        actionLabel="この条件を確認して適用"
        onConfirm={async (preview) => {
          const applied = await command({
            type: "study-settings",
            settings: preview.settings,
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
                sortedUnits: [index + 1, index + 1 + perSide],
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
                シード {preview.generator.seed} の学生割当を確認（{rows.length}
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
      {teacher.generation && (
        <div className="study-saved-generation">
          <p className="callout">
            保存済み：横向き重なり階段 ／ p={teacher.generation.parameters.p}
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
