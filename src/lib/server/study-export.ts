import { STUDY_RULES } from "../study-rules";
import { studyMarketSize } from "../study-config";
import { studyTiming } from "../study-timing";
import { studyView } from "./study-view";
import { marketRound } from "./study";
import type { AuditEvent, Room } from "./model";

export function studyExport(
  room: Room,
  events: AuditEvent[],
  now: number,
  kind: string,
  csv: (rows: unknown[][]) => string,
) {
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
            ...studyTiming(room.config),
            tradersPerMarket: studyMarketSize(room.config),
          },
          settingsRevision: study.revision,
          schedules: study.settings,
          equilibrium: teacher.equilibrium,
          participants: teacher.participants,
          markets: study.markets.map((m) => ({
            market: m.id,
            currentPeriod: marketRound(room, m),
            order: m.order,
            stage: m.stage,
            periods: m.periods,
            clearings: m.clearings,
            orderHistory: m.orderHistory ?? [],
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
      ],
      ...teacher.metrics.map((m) => {
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
          teacher.equilibrium.surplus,
          m.efficiency,
          m.inefficientTrades,
          m.spread,
          m.spreadObservedMs,
          teacher.equilibrium.low,
          teacher.equilibrium.high,
          teacher.equilibrium.quantity,
          teacher.equilibrium.quantityMax,
          slope?.slope,
          slope?.n,
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
          ((t.round - 1) % 5) + 1,
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
          t.value - t.price,
          t.price - t.cost,
          t.value - t.cost,
        ]),
    ];
  return {
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    content: csv(rows),
  };
}
