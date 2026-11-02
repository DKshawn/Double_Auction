import { benchmarks } from "./engine";
import type { Actor, Room } from "./types";
import { initialUnitsFor } from "./settings";

type Cell = string | number | null | undefined;
export function csv(rows: Cell[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((cell) => {
            let value = cell == null ? "" : String(cell);
            // User supplied strings must not become Excel formulas, even after whitespace.
            if (typeof cell === "string" && /^\s*[=+@\-\t\r]/.test(value))
              value = "'" + value;
            return '"' + value.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function exportData(room: Room, actor: Actor, kind: string) {
  const iso = (time: number) => new Date(time).toISOString();
  if (actor.role === "student") {
    const person = room.participants.find((p) => p.id === actor.participantId)!;
    const rows: Cell[][] = [
      [
        "room",
        "student_id",
        "name",
        "subject_no",
        "year",
        "period",
        "event",
        "time_utc",
        "price",
        "quantity_change",
        "cash_change",
        "holdings_at_payout",
        "dividend",
        "year_profit",
      ],
    ];
    const records: { at: number; row: Cell[] }[] = [];
    for (const trade of room.trades) {
      if (trade.buyerId !== person.id && trade.sellerId !== person.id) continue;
      const buy = trade.buyerId === person.id;
      records.push({
        at: trade.at,
        row: [
          room.code,
          person.studentId,
          person.name,
          person.seat,
          trade.year,
          trade.period,
          buy ? "buy" : "sell",
          iso(trade.at),
          trade.price,
          buy ? 1 : -1,
          buy ? -trade.price : trade.price,
          null,
          null,
          null,
        ],
      });
    }
    for (const result of room.results) {
      const payout = result.payouts.find((p) => p.participantId === person.id)!;
      records.push({
        at: result.endedAt,
        row: [
          room.code,
          person.studentId,
          person.name,
          person.seat,
          result.year,
          result.period,
          "dividend",
          iso(result.endedAt),
          null,
          null,
          null,
          payout.holdings,
          payout.dividend,
          payout.yearProfit,
        ],
      });
    }
    rows.push(...records.sort((a, b) => a.at - b.at).map((r) => r.row));
    return {
      body: csv(rows),
      extension: "csv",
      contentType: "text/csv; charset=utf-8",
    };
  }
  if (kind === "conditions") {
    return {
      body: JSON.stringify(
        {
          schemaVersion: room.schemaVersion,
          code: room.code,
          createdAt: iso(room.createdAt),
          config: {
            ...room.config,
            initialUnits: initialUnitsFor(room.config),
          },
          typeCounts:
            room.typeCounts ??
            [1, 2, 3].map(
              (type) => room.participants.filter((p) => p.type === type).length,
            ),
          benchmarks: benchmarks(room.config),
          assignment: room.participants.map((p) => ({
            subjectNo: p.seat,
            type: p.type,
            studentId: p.studentId,
            name: p.name,
          })),
          rules: {
            participants: room.participants.length,
            initialUnits: initialUnitsFor(room.config),
            totalUnits: room.participants.length * initialUnitsFor(room.config),
            unitsPerTrade: 1,
            maxEmptyUnits: 2,
            priceBounds: [1, 100000],
            cashConstraint: false,
            tradePrice: "standing-quote",
            nomination: "invitation-only",
          },
        },
        null,
        2,
      ),
      extension: "json",
      contentType: "application/json; charset=utf-8",
    };
  }
  let rows: Cell[][];
  if (kind === "participants") {
    rows = [
      [
        "room",
        "student_id",
        "name",
        "subject_no",
        "type",
        "dividend_A",
        "dividend_B",
        "completed_years_profit",
      ],
    ];
    rows.push(
      ...room.participants.map((p) => [
        room.code,
        p.studentId,
        p.name,
        p.seat,
        p.type,
        p.type ? room.config.dividends[p.type - 1]!.a : null,
        p.type ? room.config.dividends[p.type - 1]!.b : null,
        p.totalProfit,
      ]),
    );
  } else if (kind === "results") {
    rows = [
      [
        "room",
        "year",
        "period",
        "ended_utc",
        "reason",
        "volume",
        "mean_price",
        "mean_price_over_PF",
        "actual_dividend",
        "max_dividend",
        "initial_dividend",
        "allocation_efficiency",
        "gains_efficiency",
        "participants",
        "initial_units",
        "total_units",
        "period_seconds",
      ],
    ];
    rows.push(
      ...room.results.map((r) => [
        room.code,
        r.year,
        r.period,
        iso(r.endedAt),
        r.reason,
        r.volume,
        r.meanPrice,
        r.priceRatio,
        r.actualDividend,
        r.maxDividend,
        r.initialDividend,
        r.allocationEfficiency,
        r.gainEfficiency,
        room.participants.length,
        initialUnitsFor(room.config),
        room.participants.length * initialUnitsFor(room.config),
        room.config.periodSeconds,
      ]),
    );
  } else if (kind === "payouts") {
    rows = [
      [
        "room",
        "year",
        "period",
        "subject_no",
        "holdings",
        "dividend_per_unit",
        "dividend",
        "trading_cash",
        "year_profit",
      ],
    ];
    rows.push(
      ...room.results.flatMap((r) =>
        r.payouts.map((p) => [
          room.code,
          r.year,
          r.period,
          p.seat,
          p.holdings,
          p.perUnit,
          p.dividend,
          p.cash,
          p.yearProfit,
        ]),
      ),
    );
  } else if (kind === "audit") {
    rows = [["room", "sequence", "time_utc", "kind", "actor", "details"]];
    rows.push(
      ...room.events.map((e) => [
        room.code,
        e.sequence,
        iso(e.at),
        e.kind,
        e.actor,
        JSON.stringify(e.details),
      ]),
    );
  } else {
    rows = [
      [
        "room",
        "sequence",
        "year",
        "period",
        "unit",
        "time_utc",
        "buyer",
        "seller",
        "price",
        "quantity",
      ],
    ];
    rows.push(
      ...room.trades.map((t) => [
        room.code,
        t.sequence,
        t.year,
        t.period,
        t.unit,
        iso(t.at),
        t.buyerSeat,
        t.sellerSeat,
        t.price,
        1,
      ]),
    );
  }
  return {
    body: csv(rows),
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
  };
}
