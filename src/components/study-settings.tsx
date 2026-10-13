"use client";

import { useState } from "react";
import { equilibrium, equilibriumQuantity } from "@/lib/equilibrium";
import type { Command, RoomView } from "@/lib/types";
import type { StudySettings } from "@/lib/study-types";
import {
  studyMarketSize,
  studyInstitutions,
  studyPeriodCount,
  studyUnits,
} from "@/lib/study-config";
import { INSTITUTIONS } from "@/lib/study-rules";
import { studyTiming } from "@/lib/study-timing";
import { studyCommission, studyCommissionError } from "@/lib/study-commission";
import { StudyPresetGenerator } from "./study-preset-generator";
import { StudyCommissionField } from "./study-commission-settings";
import { StudyConditionPreview } from "./study-condition-preview";
import { isValidPrice, MAX_PRICE } from "@/lib/price";

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
  const marketSize = studyMarketSize(view.config);
  const timing = studyTiming(view.config);
  const institutions = studyInstitutions(view.config);
  const [draft, setDraft] = useState<StudySettings | null>(null);
  const [commissionDraft, setCommissionDraft] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const settings = draft ?? teacher.settings;
  const commission = commissionDraft ?? studyCommission(view.config);
  const valid =
    [...settings.values, ...settings.costs].every((pair) =>
      pair.every(isValidPrice),
    ) &&
    settings.values.every((p) => p.every((v, i) => i === 0 || v <= p[i - 1])) &&
    settings.costs.every((p) => p.every((v, i) => i === 0 || v >= p[i - 1]));
  const eq = valid
    ? equilibrium(settings.values.flat(), settings.costs.flat())
    : null;
  const stale = draft && revision !== view.study!.settingsRevision;
  const commissionError = valid
    ? studyCommissionError(
        commission,
        settings,
        institutions.some((i) => i !== "cda")
          ? teacher.otherSettings
          : undefined,
      )
    : "";
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
    <section className="panel study-section" aria-label="供需条件の設定">
      <div className="study-section-heading">
        <div>
          <h2>供需条件の設定</h2>
          <p className="muted">
            全市場・全期で条件を固定します。開始後は変更できません。
            {teacher.otherSettings &&
              "現在はCDAの条件を表示しています。Call Market・Posted Offerは従来の2単位の条件を保ちます。"}
          </p>
        </div>
        {!draft && (
          <button
            className="button secondary"
            disabled={disabled || view.round > 0 || view.phase !== "waiting"}
            onClick={() => {
              setDraft(structuredClone(teacher.settings));
              setCommissionDraft(studyCommission(view.config));
              setRevision(view.study!.settingsRevision);
            }}
          >
            供需条件・Commissionを変更
          </button>
        )}
      </div>
      <StudyCommissionField
        amount={commission}
        settings={valid ? settings : teacher.settings}
        otherSettings={
          institutions.some((i) => i !== "cda")
            ? teacher.otherSettings
            : undefined
        }
        onChange={setCommissionDraft}
        disabled={
          disabled || !draft || view.round > 0 || view.phase !== "waiting"
        }
      />
      <StudyPresetGenerator
        key={view.study!.settingsRevision}
        view={view}
        command={command}
        disabled={disabled}
        onApplied={() => {
          setDraft(null);
          setCommissionDraft(null);
        }}
      />
      <details open={Boolean(draft)}>
        <summary>{marketSize}人の条件を確認する</summary>
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
                      {Array.from(
                        { length: studyUnits(view.config) },
                        (_, unit) => (
                          <th key={unit}>{unit + 1}単位目</th>
                        ),
                      )}
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
                                max={MAX_PRICE}
                                step={1}
                                value={n || ""}
                                onChange={(e) =>
                                  update(side, row, unit, e.target.value)
                                }
                                disabled={
                                  disabled ||
                                  view.phase !== "waiting" ||
                                  view.round > 0
                                }
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
        <StudyConditionPreview settings={settings} commission={commission} />
      )}
      {teacher.otherSettings && institutions.some((i) => i !== "cda") && (
        <details className="study-other-conditions">
          <summary>Call Market・Posted Offerの条件（各自2単位）</summary>
          <StudyConditionPreview
            settings={teacher.otherSettings}
            commission={commission}
          />
        </details>
      )}
      {draft && (
        <>
          <p className="field-help">
            1〜{MAX_PRICE}
            円の整数。次の単位の価値は前の単位以下、費用は前の単位以上にしてください。
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
              disabled={
                disabled ||
                !valid ||
                Boolean(commissionError) ||
                Boolean(stale) ||
                view.phase !== "waiting" ||
                view.round > 0
              }
              onClick={async () => {
                if (
                  await command({
                    type: "study-settings",
                    settings: draft,
                    commission,
                    expectedRevision: revision,
                  })
                ) {
                  setDraft(null);
                  setCommissionDraft(null);
                }
              }}
            >
              この条件を保存
            </button>
            <button
              className="button secondary"
              disabled={disabled}
              onClick={() => {
                setDraft(null);
                setCommissionDraft(null);
              }}
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
            各市場は買い手{marketSize / 2}人・売り手{marketSize / 2}
            人。毎期CDAは{studyUnits(view.config)}単位、Call Market・Posted
            Offerは2単位まで取引し、役割・価値・費用は固定です。
            成立1単位につき、買い手・売り手それぞれに
            {studyCommission(view.config)}
            円のCommissionを加算します。損失が出る取引も認めます。
          </li>
          {institutions.includes("cda") && (
            <li>
              CDAは{timing.cdaSeconds}
              秒。価格優先・時間優先で、先に注文板にあった注文の価格を使います。
            </li>
          )}
          {institutions.includes("call") && (
            <li>
              Callは{timing.callSeconds}
              秒×4回。受付中の価格と残数量を注文板に公開しますが、取引は清算時刻のみ成立します。各回に1回だけ、残り数量の範囲で1〜2単位分の注文を送信できます。締切までに送信しない場合、その回は注文なしとして進みます。買値は単位順に下がり、売値は上がる注文です。同値は参加者ごとに抽選し、同じ人の1単位目を優先します。
            </li>
          )}
          {institutions.includes("call") && (
            <li>
              Callの共通価格は、成立可能な最後の買値・売値の中間値です。未約定注文は清算ごとに失効します。数量は清算ごとには戻らず、次の期で2単位に戻ります。
            </li>
          )}
          {institutions.includes("posted") && (
            <li>
              Posted Offerは{timing.offerSeconds}
              秒の非公開提示後に公開します。売り手は1つの価格と1〜2単位を1回だけ送信します。締切までに確定しなければ、今期は出品しません。
              {view.config.studyPostedMechanism === "batch-bids-v1"
                ? "その後は全買い手が買値・数量を注文でき、1秒ごとに高い買値・安い売値から約定します。同じ買値は抽選、同じ売値は提示順。価格は売り手の提示値です。買い注文の変更・取消はできません。"
                : `この旧ルームでは、買い手は毎期ランダムな順で各${timing.buyerSeconds}秒ずつ購入します。`}
            </li>
          )}
          <li>
            {institutions
              .map(
                (i) =>
                  `${INSTITUTIONS[i].short} ${studyPeriodCount(view.config, i)}期`,
              )
              .join("・")}
            、計{view.config.rounds}
            期実施します。1市場はこの順序で、多市場は選択した制度の順序を均等に割り当てます。
          </li>
          <li>
            数量比の分母は正の余剰が生じる均衡数量です。
            {eq && `現在の均衡数量は${equilibriumQuantity(eq)}単位です。`}
            ゼロ余剰の取引を含む数量比は1を超える場合があります。非効率取引は価値が費用を下回る取引を数え、効率性はCommissionを除く実現余剰で計算します。途中終了した期は収束の傾きの計算から除きます。
          </li>
          <li>
            各市場の全期の取引価格は学生にも公開します。全員の価値・費用と理論均衡は教員だけに表示します。
          </li>
        </ul>
      </details>
    </section>
  );
}
