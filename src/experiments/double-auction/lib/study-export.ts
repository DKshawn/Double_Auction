import { STUDY_RULES } from "./study-rules";
import { actionExport, eventOperations } from "./action-log";
import { STUDY_START_SECONDS } from "./study-types";
import {
  studyMarketSize,
  studyMarketCounts,
  studyUnits,
  studySingleUnitOrders,
  studyCallsPerPeriod,
  studyInstitutions,
  studyPeriodCount,
  studyPeriodAt,
} from "./study-config";
import { postedPurchaseSeconds, studyTiming } from "./study-timing";
import { studyCommission, studyTradeProfit } from "./study-commission";
import { studyView } from "./study-view";
import { marketRound, settingsForInstitution } from "./study-core";
import type { AuditEvent, Room } from "./auction-model";
import type { ExportFile } from "./exports";

export function studyExport(
  room: Room,
  events: AuditEvent[],
  now: number,
  kind: string,
  csv: (rows: unknown[][]) => string,
): ExportFile {
  if (kind === "actions") return actionExport(eventOperations(events));
  const study = room.study!,
    teacher = studyView(room, "teacher", now, "online").study!.teacher!;
  if (kind === "settings")
    return {
      extension: "json",
      contentType: "application/json; charset=utf-8",
      content: JSON.stringify(
        {
          protocol: study.protocol,
          exportedAt: new Date(now).toISOString(),
          code: room.code,
          config: room.config,
          latestPeriod: teacher.markets.reduce(
            (n, m) => Math.max(n, m.round),
            0,
          ),
          phase: room.phase,
          rules: {
            ...STUDY_RULES,
            callsPerPeriod: studyCallsPerPeriod(room.config),
            ...(studySingleUnitOrders(room.config)
              ? {
                  callSubmission: "one-current-unit-per-participant-per-call",
                  postedOffers:
                    "first-unit-sealed-then-next-unit-requoted-after-fill",
                  postedSubmissionQuantity:
                    "one-current-unit-with-no-outstanding-order",
                }
              : {}),
            unitsPerPeriod: studyInstitutions(room.config).every(
              (i) =>
                studyUnits(room.config, i) ===
                studyUnits(room.config, studyInstitutions(room.config)[0]),
            )
              ? studyUnits(room.config, studyInstitutions(room.config)[0])
              : null,
            unitsPerInstitution: {
              cda: studyUnits(room.config),
              call: studyUnits(room.config, "call"),
              posted: studyUnits(room.config, "posted"),
            },
            commission: studyCommission(room.config),
            ...studyTiming(room.config),
            postedMechanism:
              room.config.studyPostedMechanism ?? "sequential-v1",
            ...(room.config.studyPostedMechanism === "direct-purchase-v1"
              ? {
                  postedPurchaseSeconds: postedPurchaseSeconds(room.config),
                  postedBuyerOrder: "purchase-request-arrival",
                  postedSellerSelection: "buyer-selects-published-offer",
                  postedExecutionPrice: "seller-offer",
                  postedBidSubmission: "not-allowed",
                }
              : {}),
            ...(room.config.studyPostedMechanism === "batch-bids-v1"
              ? {
                  postedPurchaseSeconds: postedPurchaseSeconds(room.config),
                  postedBatchMs: 1000,
                  postedBuyerOrder:
                    "bid-price-desc-random-equal-bids-per-batch",
                  postedSellerOrder: "offer-price-asc-then-submission-sequence",
                  postedExecutionPrice: "seller-offer",
                  postedBidAmendment: "not-allowed",
                  postedBidCancellation: "not-allowed",
                }
              : {}),
            tradersPerMarket: room.config.studyLayout
              ? null
              : studyMarketSize(room.config),
            marketLayout: teacher.markets.map((m) => ({
              market: m.id,
              ...studyMarketCounts(room.config, m.id),
            })),
            institutions: studyInstitutions(room.config),
            periodsPerInstitution: Object.fromEntries(
              studyInstitutions(room.config).map((i) => [
                i,
                studyPeriodCount(room.config, i),
              ]),
            ),
            periods: room.config.rounds,
          },
          settingsRevision: study.revision,
          ...(study.lobby
            ? {
                assignment: study.lobby,
                startCountdownSeconds: STUDY_START_SECONDS,
              }
            : {}),
          schedules: study.settings,
          ...(study.conditionsByInstitution
            ? {
                schedulesByInstitution: Object.fromEntries(
                  studyInstitutions(room.config).map((i) => [
                    i,
                    settingsForInstitution(room, i),
                  ]),
                ),
              }
            : {}),
          schedulesInstitution: study.conditionsByInstitution
            ? studyInstitutions(room.config)[0]
            : study.otherSettings
              ? "cda"
              : "all-selected",
          ...(!study.conditionsByInstitution && study.otherSettings
            ? { otherInstitutionSchedules: study.otherSettings }
            : {}),
          ...(study.generation ? { generation: study.generation } : {}),
          equilibrium: teacher.equilibrium,
          equilibria: teacher.equilibria,
          marketEquilibria: teacher.marketEquilibria,
          participants: teacher.participants,
          markets: study.markets.map((m) => ({
            market: m.id,
            schedules: Object.fromEntries(
              studyInstitutions(room.config).map((i) => [
                i,
                settingsForInstitution(room, i, m.id),
              ]),
            ),
            currentPeriod: marketRound(room, m),
            order: m.order,
            stage: m.stage,
            periods: m.periods,
            clearings: m.clearings,
            orderHistory: m.orderHistory ?? [],
            offerHistory: m.offerHistory ?? [],
            ...(m.posted ? { posted: m.posted } : {}),
          })),
          metrics: teacher.metrics,
          convergenceSlopes: teacher.slopes,
        },
        null,
        2,
      ),
    };
  let rows: unknown[][];
  if (kind === "events")
    rows = [
      [
        "連番",
        "日時_UTC",
        "市場",
        "全体期",
        "制度",
        "段階",
        "種類",
        "参加者ID",
        "内容_JSON",
        "通貨",
        "記録スコープ_0は共通",
      ],
      ...events.map((e) => [
        e.sequence,
        new Date(e.at).toISOString(),
        e.detail.market,
        e.round,
        e.detail.institution,
        e.detail.stage,
        e.type,
        e.actor,
        JSON.stringify(e.detail),
        "JPY",
        e.scope ?? 0,
      ]),
    ];
  else if (kind === "metrics")
    rows = [
      [
        "市場",
        "制度",
        "全体期",
        "制度内期",
        "完了区分",
        "約定数量",
        "数量比_Q/Q正余剰",
        "平均価格_円",
        "均衡区間からの平均距離_円",
        "価格偏差_alpha",
        "実現余剰_円",
        "最大余剰_円",
        "効率_%",
        "非効率取引数_v小c",
        "時間加重スプレッド_円",
        "スプレッド観測_ms",
        "均衡下限_円",
        "均衡上限_円",
        "均衡数量_正余剰",
        "均衡数量_ゼロ余剰含む",
        "alpha傾き",
        "傾きに用いた期数",
        "Commission支給総額_円",
        "参加者利益合計_commission込み_円",
      ],
      ...teacher.metrics.map((m) => {
        const eq =
          teacher.marketEquilibria?.[m.market]?.[m.institution] ??
          teacher.equilibria?.[m.institution] ??
          teacher.equilibrium;
        const slope = teacher.slopes.find(
          (s) => s.market === m.market && s.institution === m.institution,
        );
        return [
          m.market,
          m.institution,
          m.round,
          m.institutionPeriod,
          m.completion,
          m.quantity,
          m.quantityRatio,
          m.mean,
          m.deviation,
          m.alpha,
          m.surplus,
          eq.surplus,
          m.efficiency,
          m.inefficientTrades,
          m.spread,
          m.spreadObservedMs,
          eq.low,
          eq.high,
          eq.quantity,
          eq.quantityMax,
          slope?.slope,
          slope?.n,
          m.commissionPaid,
          m.surplus + m.commissionPaid,
        ];
      }),
    ];
  else
    rows = [
      [
        "取引ID",
        "連番",
        "日時_UTC",
        "市場",
        "制度",
        "全体期",
        "制度内期",
        "Call清算回",
        "価格_円",
        "数量",
        "買い手ID",
        "売り手ID",
        "買い手",
        "売り手",
        "買い手単位",
        "売り手単位",
        "買い手価値_円",
        "売り手費用_円",
        "買い手利益_円",
        "売り手利益_円",
        "実現余剰_円",
        "買い手利益_commission除く_円",
        "売り手利益_commission除く_円",
        "Commission_片側1単位_円",
      ],
      ...study.markets
        .flatMap((m) => m.trades)
        .sort(
          (a, b) =>
            a.at - b.at || a.market - b.market || a.sequence - b.sequence,
        )
        .map((t) => [
          t.id,
          t.sequence,
          new Date(t.at).toISOString(),
          t.market,
          t.institution,
          t.round,
          studyPeriodAt(
            room.config,
            study.markets.find((m) => m.id === t.market)!.order,
            t.round,
          ).period,
          t.call,
          t.price,
          1,
          t.buyerId,
          t.sellerId,
          t.buyerAlias,
          t.sellerAlias,
          t.buyerUnit,
          t.sellerUnit,
          t.value,
          t.cost,
          studyTradeProfit(t, "buyer"),
          studyTradeProfit(t, "seller"),
          t.value - t.cost,
          t.value - t.price,
          t.price - t.cost,
          t.commission ?? 0,
        ]),
    ];
  return {
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    content: csv(rows),
    rowCount: rows.length - 1,
  };
}
