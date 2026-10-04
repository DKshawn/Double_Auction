import type { RoomConfig, Role } from "./types";

export const DEFAULT_MARKET_SIZE = 16;
export const MAX_STUDY_PARTICIPANTS = 192;
export const MAX_STUDY_MARKETS = MAX_STUDY_PARTICIPANTS / 2;

// Missing size belongs to an existing room with the original 8 + 8 design.
export const studyMarketSize = (config: Pick<RoomConfig, "marketSize">) =>
  config.marketSize ?? DEFAULT_MARKET_SIZE;
export const studyMarketId = (config: RoomConfig, seat: number) =>
  Math.floor(seat / studyMarketSize(config)) + 1;
export const studyRoleIndex = (config: RoomConfig, seat: number) =>
  seat % (studyMarketSize(config) / 2);
export const studyRole = (config: RoomConfig, seat: number): Role =>
  seat % studyMarketSize(config) < studyMarketSize(config) / 2
    ? "buyer"
    : "seller";

export function studyLayoutError(markets: number, marketSize: number) {
  if (
    !Number.isInteger(marketSize) ||
    marketSize < 2 ||
    marketSize > MAX_STUDY_PARTICIPANTS ||
    marketSize % 2 !== 0
  )
    return `1市場の人数は2〜${MAX_STUDY_PARTICIPANTS}人の偶数で設定してください。`;
  if (!Number.isInteger(markets) || markets < 1 || markets > MAX_STUDY_MARKETS)
    return `市場数は1〜${MAX_STUDY_MARKETS}の整数で設定してください。`;
  if (markets * marketSize > MAX_STUDY_PARTICIPANTS)
    return `合計人数は${MAX_STUDY_PARTICIPANTS}人以内にしてください。`;
  return "";
}
