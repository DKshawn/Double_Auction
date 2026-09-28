"use client";

import { useState } from "react";
import { equilibrium, equilibriumQuantity } from "@/lib/equilibrium";
import { decimal } from "@/lib/client";
import type { Command, RoomView } from "@/lib/types";
import type { StudySettings } from "@/lib/study-types";

export function StudySettingsEditor({
  view,
  command,
  disabled,
}: {
  view: RoomView;
  command: (c: Command) => Promise<boolean>;
  disabled: boolean;
}) {
  const teacher = view.study!.teacher!;
  const [draft, setDraft] = useState<StudySettings | null>(null);
  const [revision, setRevision] = useState(0);
  const settings = draft ?? teacher.settings;
  const valid =
    [...settings.values, ...settings.costs].every((pair) =>
      pair.every((n) => Number.isInteger(n) && n >= 1 && n <= 999),
    ) &&
    settings.values.every((p) => p[0] >= p[1]) &&
    settings.costs.every((p) => p[0] <= p[1]);
  const eq = valid
    ? equilibrium(settings.values.flat(), settings.costs.flat())
    : null;
  const stale = draft && revision !== view.study!.settingsRevision;
  function update(
    side: keyof StudySettings,
    row: number,
    unit: number,
    value: string,
  ) {
    const next = structuredClone(settings);
    next[side][row][unit] = Number(value);
    setDraft(next);
  }
  return (
    <section className="panel study-section">
      <div className="study-section-heading">
        <div>
          <h2>価値と費用の設定</h2>
          <p className="muted">
            全市場・全制度・全15期で同じ条件を使います。開始後は変更できません。
          </p>
        </div>
        {!draft && (
          <button
            className="button secondary"
            disabled={disabled || view.round > 0 || view.phase !== "waiting"}
            onClick={() => {
              setDraft(structuredClone(teacher.settings));
              setRevision(view.study!.settingsRevision);
            }}
          >
            価値・費用を変更
          </button>
        )}
      </div>
      <details open={Boolean(draft)}>
        <summary>16人の条件を確認する</summary>
        <div className="study-settings-grid">
          {(["values", "costs"] as const).map((side) => (
            <div key={side}>
              <h3>
                {side === "values" ? "買い手の価値" : "売り手の費用"}（円）
              </h3>
              <div className="study-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>参加者</th>
                      <th>1単位目</th>
                      <th>2単位目</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings[side].map((pair, row) => (
                      <tr key={row}>
                        <td>
                          {side === "values" ? "買" : "売"}
                          {String(row + 1).padStart(2, "0")}
                        </td>
                        {pair.map((n, unit) => (
                          <td key={unit}>
                            {draft ? (
                              <input
                                aria-label={`${side === "values" ? "買" : "売"}${row + 1}・${unit + 1}単位目`}
                                type="number"
                                min={1}
                                max={999}
                                step={1}
                                value={n || ""}
                                onChange={(e) =>
                                  update(side, row, unit, e.target.value)
                                }
                                disabled={disabled || view.round > 0}
                              />
                            ) : (
                              n
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </details>
      {eq && (
        <p className="callout">
          理論均衡：{decimal(eq.low)}〜{decimal(eq.high)}円 ／ 数量{" "}
          {equilibriumQuantity(eq)} ／ 最大余剰 {decimal(eq.surplus)}円
        </p>
      )}
      {draft && (
        <>
          <p className="field-help">
            1〜999円の整数。買い手の2単位目は1単位目以下、売り手の2単位目は1単位目以上にしてください。
          </p>
          {!valid && (
            <p className="error-message">値と単位の順序を確認してください。</p>
          )}
          {stale && (
            <p className="error-message">
              別の操作で設定が更新されました。一度キャンセルして、最新の設定を開いてください。
            </p>
          )}
          <div className="study-actions">
            <button
              className="button primary"
              disabled={disabled || !valid || Boolean(stale) || view.round > 0}
              onClick={async () => {
                if (
                  await command({
                    type: "study-settings",
                    settings: draft,
                    expectedRevision: revision,
                  })
                )
                  setDraft(null);
              }}
            >
              この条件を保存
            </button>
            <button
              className="button secondary"
              disabled={disabled}
              onClick={() => setDraft(null)}
            >
              キャンセル
            </button>
          </div>
        </>
      )}
      <details className="study-rules">
        <summary>採用した実験ルール</summary>
        <ul>
          <li>
            各市場は買い手8人・売り手8人。全員が毎期2単位まで取引し、役割・価値・費用は固定です。手数料は0円で、損失が出る取引も認めます。
          </li>
          <li>
            CDAは180秒。価格優先・時間優先で、先に注文板にあった注文の価格を使います。
          </li>
          <li>
            Callは30秒×4回。各回に1回だけ、残り数量分の注文を送信できます。買値は単位順に下がり、売値は上がる注文です。同値は参加者ごとに抽選し、同じ人の1単位目を優先します。
          </li>
          <li>
            Callの共通価格は、成立可能な最後の買値・売値の中間値です。未約定注文は清算ごとに失効します。数量は清算ごとには戻らず、次の期で2単位に戻ります。
          </li>
          <li>
            Posted
            Offerは60秒の非公開提示後に公開します。売り手は1つの価格と0〜2単位を1回だけ送信します。買い手は毎期ランダムな順で各10秒。購入完了・辞退で次の人に進みます。
          </li>
          <li>
            1市場の練習はCDA→Call→Posted。6市場は6通りの制度順を1市場ずつ、12市場は2市場ずつ割り当てます。
          </li>
          <li>
            数量比の分母は正の余剰が生じる均衡数量です。初期条件では10単位、ゼロ余剰を含む上限は11単位です。途中終了した期は収束の傾きの計算から除きます。
          </li>
          <li>
            各市場の全期の取引価格は学生にも公開します。全員の価値・費用と理論均衡は教員だけに表示します。
          </li>
        </ul>
      </details>
    </section>
  );
}
