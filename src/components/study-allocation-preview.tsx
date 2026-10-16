import { equilibrium } from "@/lib/equilibrium";
import { studyMarketSettings, studyInstitutions } from "@/lib/study-config";
import { studyCommissionEquilibrium } from "@/lib/study-commission";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { RoomConfig } from "@/lib/types";
import type {
  StudyAllocationPlan,
  StudySettings,
  StudyEquilibrium,
} from "@/lib/study-types";
import { StudyConditionPreview } from "./study-condition-preview";

export function StudyAllocationPreview({
  plan,
  config,
  settings,
  otherSettings,
  commission,
}: {
  plan: StudyAllocationPlan;
  config: RoomConfig;
  settings: StudySettings;
  otherSettings?: StudySettings;
  commission: number;
}) {
  const actualConfig = { ...config, studyLayout: plan.layout };
  const rows = plan.layout.flatMap((counts, index) =>
    studyInstitutions(config).map((institution) => {
      const actual = studyMarketSettings(
        actualConfig,
        institution === "cda" ? settings : (otherSettings ?? settings),
        index + 1,
      );
      const waiting = !counts.buyers || !counts.sellers;
      return {
        market: index + 1,
        counts,
        institution,
        actual,
        eq: waiting
          ? null
          : equilibrium(actual.values.flat(), actual.costs.flat()),
        rewarded: waiting
          ? null
          : studyCommissionEquilibrium(
              actual,
              Number.isFinite(commission) ? commission : 0,
            ),
      };
    }),
  );
  const price = (eq: StudyEquilibrium | null) =>
    eq ? `${eq.low === eq.high ? eq.low : `${eq.low}〜${eq.high}`}円` : "—";
  const quantity = (eq: StudyEquilibrium | null) =>
    eq
      ? `${eq.quantity === eq.quantityMax ? eq.quantity : `${eq.quantity}〜${eq.quantityMax}`}単位`
      : "—";
  return (
    <section
      className="study-allocation-preview"
      aria-label="市場別の供需プレビュー"
    >
      <h3>市場別の供需プレビュー</h3>
      <p className="field-help">
        {plan.attendance}人・{plan.layout.length}市場 ／ 最大市場
        {Math.max(0, ...plan.layout.map((m) => m.buyers + m.sellers))}人 →
        供需テンプレート{plan.templateSize}人（買・売 各{plan.templateSize / 2}
        人）
      </p>
      {!rows.length ? (
        <p className="field-help">
          入室人数が2人以上になると、市場ごとの供需条件を表示します。
        </p>
      ) : (
        <>
          <div
            className="study-table-wrap study-allocation-table"
            tabIndex={0}
            aria-label="市場別の理論均衡をスクロール"
          >
            <table>
              <caption>実人数での理論均衡</caption>
              <thead>
                <tr>
                  <th>市場</th>
                  <th>制度</th>
                  <th>買／売</th>
                  <th>原始均衡価格</th>
                  <th>原始均衡数量</th>
                  <th>Commission込み価格</th>
                  <th>Commission込み数量</th>
                  <th>最大総余剰</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.market}-${row.institution}`}>
                    <td>
                      {row.market}
                      {!row.eq && "（補充待ち）"}
                    </td>
                    <td>{INSTITUTIONS[row.institution].short}</td>
                    <td>
                      {row.counts.buyers}／{row.counts.sellers}
                    </td>
                    <td>{price(row.eq)}</td>
                    <td>{quantity(row.eq)}</td>
                    <td>{price(row.rewarded)}</td>
                    <td>{quantity(row.rewarded)}</td>
                    <td>{row.eq ? `${row.eq.surplus}円` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>各市場の供需図・全単位の数値</summary>
            {rows
              .filter((row) => row.eq)
              .map((row) => (
                <section key={`${row.market}-${row.institution}`}>
                  <h4>
                    市場{row.market}・{INSTITUTIONS[row.institution].short}（買
                    {row.counts.buyers}人・売{row.counts.sellers}人）
                  </h4>
                  <StudyConditionPreview
                    settings={row.actual}
                    commission={commission}
                  />
                </section>
              ))}
          </details>
        </>
      )}
    </section>
  );
}
