export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
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
    throw new ApiError(result.error || "通信に失敗しました。", response.status);
  return result as T;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.name === "TypeError"
      ? "接続が途切れました。通信状況を確認してください。"
      : error.message
    : "操作に失敗しました。";
export const timeLabel = (at: number) =>
  new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Tokyo",
    hour12: false,
  }).format(at);
export const decimal = (value: number | null | undefined) =>
  value == null
    ? "—"
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(1);
