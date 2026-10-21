import { z } from "zod";
import type { ActionLog, ClientAction, Operation } from "../action-log";
import type { CommandRequest } from "../types";
import { emit, type AuditEvent, type Room } from "../auction-model";
import type { Sql } from "./database";

export const interactionSchema = z
  .object({
    id: z.uuid(),
    button: z.string().min(1).max(120),
    clickedAt: z.number().int().min(0).max(8.64e15),
    clockOffsetMs: z.number().finite().min(-8.64e15).max(8.64e15),
    tabId: z.uuid(),
    elapsedMs: z.number().finite().min(0),
  })
  .strict();
export const clientActionSchema = z
  .object({
    id: z.uuid(),
    interaction: interactionSchema,
    sequence: z.number().int().min(0),
    label: z.string().max(160),
    method: z.enum(["pointer", "keyboard", "programmatic"]),
    round: z.number().int().min(0),
    market: z.number().int().min(1).optional(),
    stage: z.string().max(80).optional(),
    version: z.number().int().min(0),
    periodStartedAt: z.number().int().min(0).max(8.64e15).optional(),
    commandType: z.string().max(60).optional(),
    requestId: z.uuid().optional(),
    phase: z.enum(["activation", "result"]),
    status: z
      .enum([
        "local_success",
        "blocked",
        "acknowledged",
        "rejected",
        "unconfirmed",
      ])
      .optional(),
    result: z.string().max(80).optional(),
    errorCode: z.string().max(80).optional(),
    reason: z.string().max(240).optional(),
    respondedAt: z.number().int().min(0).max(8.64e15).optional(),
  })
  .strict()
  .refine(
    (entry) =>
      !["local_success", "acknowledged"].includes(entry.status ?? "") ||
      (!entry.reason && !entry.errorCode),
    "成功操作には失敗理由を記録しません。",
  );
export const actionBatchSchema = z
  .object({
    participantId: z.uuid(),
    entries: z.array(clientActionSchema).min(1).max(32),
  })
  .strict();

export function operationInput(
  command: CommandRequest["command"],
): Operation["input"] {
  return {
    ...("price" in command ? { price: command.price } : {}),
    ...("quantity" in command ? { quantity: command.quantity } : {}),
    ...("prices" in command ? { prices: command.prices } : {}),
    ...("good" in command ? { good: command.good } : {}),
    ...("orderId" in command
      ? { targetOrderId: command.orderId }
      : "quoteId" in command
        ? { targetOrderId: command.quoteId }
        : "offerId" in command
          ? { targetOrderId: command.offerId }
          : {}),
  };
}

export function annotateOperation(
  room: Room,
  events: AuditEvent[],
  actor: string,
  request: CommandRequest,
  receivedAt: number,
  now: number,
  context?: Pick<Operation, "round" | "market" | "stage">,
) {
  const trades = events
    .filter((event) => event.type === "trade")
    .map((event) => ({
      id: String(event.detail.id ?? event.detail.tradeId),
      price: Number(event.detail.price),
      quantity: 1,
    }));
  const order = events.find(
    (event) =>
      event.actor === actor &&
      [
        "quote",
        "accept",
        "call-order",
        "posted-offer",
        "posted-bid",
        "cancel",
      ].includes(event.type),
  );
  const cmd = request.command;
  const resultCodes: Record<string, string> = {
    "call-submit": "call_order_submitted",
    "posted-offer": "offer_submitted",
    "posted-bid": "bid_submitted",
    "posted-pass": "purchase_passed",
  };
  const operation: Operation = {
    requestId: request.requestId,
    commandType: cmd.type,
    actor,
    round: order?.round ?? context?.round ?? events.at(-1)?.round ?? room.round,
    ...(context?.market
      ? { market: context.market }
      : order?.detail.market
        ? { market: Number(order.detail.market) }
        : {}),
    ...(context?.stage
      ? { stage: context.stage }
      : order?.detail.stage
        ? { stage: String(order.detail.stage) }
        : {}),
    input: operationInput(cmd),
    receivedAt,
    processedAt: now,
    ...(request.interaction ? { interaction: request.interaction } : {}),
    status: "success",
    result: {
      code: trades.length
        ? "trade_executed"
        : ["study-quote", "quote"].includes(cmd.type)
          ? "quote_accepted"
          : ["study-cancel", "cancel"].includes(cmd.type)
            ? !order ||
              (Array.isArray(order.detail.orders) &&
                !order.detail.orders.length)
              ? "no_orders_to_cancel"
              : "orders_cancelled"
            : (resultCodes[cmd.type] ?? "operation_completed"),
      ...(order?.detail.id || order?.detail.quoteId
        ? { orderId: String(order.detail.id ?? order.detail.quoteId) }
        : {}),
      ...(cmd.type === "study-accept"
        ? { targetOrderId: cmd.orderId }
        : cmd.type === "accept"
          ? { targetOrderId: cmd.quoteId }
          : {}),
      ...(trades.length ? { trades } : {}),
    },
  };
  const period = room.study?.markets
    .find((market) => market.id === operation.market)
    ?.periods.find((period) => period.round === operation.round);
  if (period) operation.periodStartedAt = period.startedAt;
  let target = order ?? events.find((event) => event.actor === actor);
  if (!target) {
    emit(
      room,
      events,
      now,
      "command-completed",
      actor,
      { market: operation.market, stage: operation.stage },
      operation.round,
    );
    target = events.at(-1)!;
  }
  target.detail.operation = operation;
  // Correlate every fill/side effect without duplicating the full audit object.
  for (const event of events) {
    event.detail.requestId = request.requestId;
    event.detail.commandType = cmd.type;
  }
  return operation;
}

export async function writeActionLogs(
  db: Sql,
  code: string,
  logs: ActionLog[],
) {
  if (!logs.length) return;
  await db.query(
    `INSERT INTO auction_action_logs (room_code, actor, source, event_id, entry)
     SELECT $1, e->>'actor', e->>'source', CASE WHEN e->>'source' = 'client' THEN e->'data'->>'id' ELSE e->'data'->>'requestId' END, e
     FROM jsonb_array_elements($2::jsonb) e ON CONFLICT DO NOTHING`,
    [code, JSON.stringify(logs)],
  );
}

export async function readActionLogs(
  db: Sql,
  code: string,
  actor?: string,
  requestId?: string,
): Promise<ActionLog[]> {
  const result = await db.query<{ entry: ActionLog }>(
    `SELECT entry FROM auction_action_logs WHERE room_code = $1 AND ($2::text IS NULL OR actor = $2)
       AND ($3::text IS NULL OR entry->'data'->>'requestId' = $3)
     UNION ALL
     SELECT jsonb_build_object('source', 'server', 'actor', event->>'actor', 'at', event->'at', 'data', event->'detail'->'operation') AS entry
     FROM (SELECT event FROM auction_events WHERE room_code = $1 UNION ALL SELECT event FROM auction_market_events WHERE room_code = $1) e
     WHERE event->'detail'->'operation' IS NOT NULL AND ($2::text IS NULL OR event->>'actor' = $2)
       AND ($3::text IS NULL OR event->'detail'->'operation'->>'requestId' = $3)`,
    [code, actor ?? null, requestId ?? null],
  );
  return result.rows.map((row) => row.entry);
}

export function clientLogs(
  actor: string,
  entries: ClientAction[],
  at: number,
): ActionLog[] {
  return entries.map((data) => ({ source: "client", actor, at, data }));
}
