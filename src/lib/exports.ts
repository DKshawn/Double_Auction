export const EXPORTS = [
  {
    kind: "trades",
    label: "取引履歴 CSV",
    empty: "取引履歴はまだありません。",
  },
  {
    kind: "metrics",
    label: "市場・期別集計 CSV",
    empty: "集計対象の期はまだありません。",
  },
  {
    kind: "events",
    label: "操作ログ CSV",
    empty: "操作ログはまだありません。",
  },
  { kind: "settings", label: "実験条件 JSON", empty: "" },
] as const;

export type ExportKind = (typeof EXPORTS)[number]["kind"];
export const isExportKind = (kind: string): kind is ExportKind =>
  EXPORTS.some((item) => item.kind === kind);
