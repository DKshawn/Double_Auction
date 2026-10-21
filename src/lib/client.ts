export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "OPERATION_REJECTED",
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
    signal,
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error || "通信に失敗しました。",
      response.status,
      result.code,
    );
  return result as T;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.name === "TypeError"
      ? "接続が途切れました。通信状況を確認してください。"
      : error.message
    : "操作に失敗しました。";
const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Tokyo",
  hour12: false,
});
// Visible history rows reuse their labels when orders arrive or the user
// scrolls. Bound this cache independently of the experiment's total history.
const timeLabels = new Map<number, string>();
export function timeLabel(at: number): string {
  const cached = timeLabels.get(at);
  if (cached !== undefined) return cached;
  const label = timeFormatter.format(at);
  if (timeLabels.size >= 1024)
    timeLabels.delete(timeLabels.keys().next().value!);
  timeLabels.set(at, label);
  return label;
}
export const decimal = (value: number | null | undefined) =>
  value == null
    ? "—"
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(1);
