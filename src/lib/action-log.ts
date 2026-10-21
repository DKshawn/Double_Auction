import type { AuditEvent } from "./auction-model";
import type { ExportFile } from "./exports";
import { csv } from "./csv";

export type Interaction = {
  id: string;
  button: string;
  clickedAt: number;
  clockOffsetMs: number;
  tabId: string;
  elapsedMs: number;
};
export type ClientAction = {
  id: string;
  interaction: Interaction;
  sequence: number;
  label: string;
  method: "pointer" | "keyboard" | "programmatic";
  round: number;
  market?: number;
  stage?: string;
  periodStartedAt?: number;
  version: number;
  commandType?: string;
  requestId?: string;
  phase: "activation" | "result";
  status?:
    "local_success" | "blocked" | "acknowledged" | "rejected" | "unconfirmed";
  result?: string;
  errorCode?: string;
  reason?: string;
  respondedAt?: number;
};
export type Operation = {
  requestId: string;
  commandType: string;
  actor: string;
  round: number;
  market?: number;
  stage?: string;
  periodStartedAt?: number;
  input?: {
    price?: number;
    quantity?: number;
    prices?: number[];
    targetOrderId?: string;
    good?: string;
  };
  receivedAt: number;
  processedAt: number;
  interaction?: Interaction;
  status: "success" | "rejected" | "unconfirmed";
  result?: {
    code: string;
    orderId?: string;
    targetOrderId?: string;
    trades?: { id: string; price: number; quantity: number }[];
  };
  errorCode?: string;
  reason?: string;
};
export type ActionLog = {
  source: "client" | "server";
  actor: string;
  at: number;
  data: ClientAction | Operation;
};

export function eventOperations(events: AuditEvent[]): ActionLog[] {
  return events.flatMap((event) => {
    const operation = event.detail.operation as Operation | undefined;
    return operation
      ? [
          {
            source: "server" as const,
            actor: event.actor,
            at: event.at,
            data: operation,
          },
        ]
      : [];
  });
}

const iso = (at?: number) =>
  at === undefined || !Number.isFinite(at) || Math.abs(at) > 8.64e15
    ? ""
    : new Date(at).toISOString();
const jst = (at?: number) =>
  at === undefined
    ? ""
    : iso(at + 9 * 3600_000)
        .replace("T", " ")
        .replace("Z", "+09:00");
const names: Record<string, string> = {
  "study-quote": "指値注文：価格を提出",
  quote: "指値注文：価格を提出",
  "study-accept": "成行注文：最良注文を受諾",
  accept: "成行注文：最良注文を受諾",
  "study-cancel": "注文取消",
  cancel: "注文取消",
  "call-submit": "Call注文確定",
  "posted-offer": "販売価格・数量を確定",
  "posted-bid": "購入希望を提出",
  "posted-buy": "提示注文を購入",
  "posted-pass": "購入を見送る",
};

// One row per activation/command. Server commits override client observations,
// including timeouts and lost HTTP responses. Historical events are not inferred.
export function actionExport(logs: ActionLog[]): ExportFile {
  type Row = {
    actor: string;
    click?: ClientAction;
    client?: ClientAction;
    operation?: Operation;
  };
  const rows = new Map<string, Row>();
  for (const log of [...logs].sort((a, b) => a.at - b.at)) {
    const data = log.data;
    const key = `${log.actor}:${data.interaction?.id ?? (data as Operation).requestId}`;
    const row = rows.get(key) ?? { actor: log.actor };
    rows.set(key, row);
    if (log.source === "server") {
      const next = data as Operation;
      if (row.operation?.status !== "success") row.operation = next;
    } else {
      const next = data as ClientAction;
      row.click ??= next;
      if (next.phase === "activation") row.click = next;
      if (!row.client || next.sequence > row.client.sequence) row.client = next;
    }
  }
  const output: unknown[][] = [
    [
      "参加者ID",
      "操作ID",
      "リクエストID",
      "ボタンID",
      "表示名",
      "操作",
      "コマンド",
      "市場",
      "期",
      "段階",
      "クリック日時_端末UTC",
      "クリック日時_端末JST",
      "時計補正_ms",
      "クリック日時_サーバー推定UTC",
      "ページ経過_ms",
      "期開始から_推定ms",
      "サーバー受信_UTC",
      "サーバー判定_UTC",
      "端末応答受信_UTC",
      "結果",
      "成功結果",
      "失敗コード",
      "失敗理由",
      "記録根拠",
      "詳細_JSON",
    ],
  ];
  for (const row of [...rows.values()].sort(
    (a, b) =>
      (a.click?.interaction.clickedAt ?? a.operation!.receivedAt) -
      (b.click?.interaction.clickedAt ?? b.operation!.receivedAt),
  )) {
    const { click, client, operation: op } = row;
    const interaction = click?.interaction ?? op?.interaction;
    const command = op?.commandType ?? client?.commandType ?? "";
    const status = op?.status ?? client?.status ?? "unconfirmed";
    const success = status === "success" || status === "local_success";
    output.push([
      row.actor,
      interaction?.id,
      op?.requestId ?? client?.requestId,
      interaction?.button,
      click?.label,
      names[command] ?? (command || interaction?.button),
      command,
      op?.market ?? click?.market,
      op?.round ?? click?.round,
      op?.stage ?? click?.stage,
      iso(interaction?.clickedAt),
      jst(interaction?.clickedAt),
      interaction?.clockOffsetMs,
      iso(interaction && interaction.clickedAt + interaction.clockOffsetMs),
      interaction?.elapsedMs,
      interaction &&
      (op?.periodStartedAt ?? click?.periodStartedAt) !== undefined
        ? interaction.clickedAt +
          interaction.clockOffsetMs -
          (op?.periodStartedAt ?? click!.periodStartedAt!)
        : "",
      iso(op?.receivedAt),
      iso(op?.processedAt),
      iso(client?.respondedAt),
      status === "acknowledged" ? "unconfirmed" : status,
      success ? (op?.result?.code ?? client?.result) : "",
      success ? "" : (op?.errorCode ?? client?.errorCode),
      success ? "" : (op?.reason ?? client?.reason),
      op ? "server" : "client",
      JSON.stringify(op ? { input: op.input, result: op.result } : {}),
    ]);
  }
  return {
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    content: csv(output),
    rowCount: output.length - 1,
  };
}
