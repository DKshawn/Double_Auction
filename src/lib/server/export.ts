import { GOODS } from "../catalog";
import { toView } from "./engine";
import type { AuditEvent, Room } from "./model";

export function csv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            // Protect spreadsheet users from formulas in participant-controlled names.
            if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}

export function exportData(
  room: Room,
  events: AuditEvent[],
  now: number,
  kind: string,
) {
  const teacher = toView(room, "teacher", now, "online").teacher!;
  if (kind === "settings")
    return {
      extension: "json",
      contentType: "application/json; charset=utf-8",
      content: JSON.stringify(
        {
          protocol: "continuous-double-auction-v1",
          exportedAt: new Date(now).toISOString(),
          code: room.code,
          config: room.config,
          marketSettings: teacher.marketSettings,
          settingsRevision: teacher.settingsRevision,
          currentRound: room.round,
          phase: room.phase,
          rules: {
            priority: "price-then-time",
            executionPrice: "resting-order",
            unitsPerGoodPerRound: 1,
            fixedRoles: true,
            fixedSchedules: true,
            lossMakingQuotesAllowed: false,
            currency: "points",
          },
          schedules: teacher.schedules,
          equilibria: teacher.equilibria,
          participants: teacher.participants,
          metrics: teacher.metrics,
        },
        null,
        2,
      ),
    };
  let rows: unknown[][];
  if (kind === "events") {
    rows = [
      ["連番", "日時_UTC", "ラウンド", "種類", "参加者ID", "内容_JSON"],
      ...events.map((e) => [
        e.sequence,
        new Date(e.at).toISOString(),
        e.round,
        e.type,
        e.actor,
        JSON.stringify(e.detail),
      ]),
    ];
  } else if (kind === "metrics") {
    rows = [
      [
        "商品",
        "ラウンド",
        "約定数量",
        "平均価格",
        "均衡区間からの平均距離",
        "効率_%",
        "均衡下限",
        "均衡上限",
        "均衡数量",
        "均衡数量上限",
      ],
      ...GOODS.flatMap(({ id, name }) =>
        teacher.metrics[id].map((m) => [
          name,
          m.round,
          m.quantity,
          m.mean,
          m.deviation,
          m.efficiency,
          teacher.equilibria[id].low,
          teacher.equilibria[id].high,
          teacher.equilibria[id].quantity,
          teacher.equilibria[id].quantityMax,
        ]),
      ),
    ];
  } else {
    rows = [
      [
        "取引ID",
        "連番",
        "日時_UTC",
        "ラウンド",
        "商品",
        "価格",
        "数量",
        "買い手ID",
        "売り手ID",
        "買い手",
        "売り手",
        "買い手価値",
        "売り手費用",
        "買い手利益",
        "売り手利益",
      ],
      ...room.trades.map((t) => {
        const buyer = room.participants.find((p) => p.id === t.buyerId)!;
        const seller = room.participants.find((p) => p.id === t.sellerId)!;
        return [
          t.id,
          t.sequence,
          new Date(t.at).toISOString(),
          t.round,
          GOODS.find((g) => g.id === t.good)!.name,
          t.price,
          1,
          buyer.id,
          seller.id,
          buyer.alias,
          seller.alias,
          buyer.limits[t.good],
          seller.limits[t.good],
          buyer.limits[t.good] - t.price,
          t.price - seller.limits[t.good],
        ];
      }),
    ];
  }
  return {
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    content: csv(rows),
  };
}
