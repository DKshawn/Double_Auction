import type { RoomConfig, Role } from "./types";
import type { Institution, StudyPeriods } from "./study-types";

export const DEFAULT_STUDY_INSTITUTIONS: readonly Institution[] = [
  "cda",
  "call",
  "posted",
];
// Rooms created before institution selection keep all three institutions.
export const studyInstitutions = (
  config: Pick<RoomConfig, "studyInstitutions">,
): readonly Institution[] =>
  config.studyInstitutions ?? DEFAULT_STUDY_INSTITUTIONS;

export const DEFAULT_STUDY_PERIODS: Readonly<StudyPeriods> = {
  cda: 5,
  call: 5,
  posted: 5,
};
export const MAX_INSTITUTION_PERIODS = 20;
export const MAX_STUDY_ROUNDS = MAX_INSTITUTION_PERIODS * 3;
type PeriodConfig = Pick<RoomConfig, "studyPeriods">;
// Existing rooms retain five periods per institution.
export const studyPeriodCount = (
  config: PeriodConfig,
  institution: Institution,
) => config.studyPeriods?.[institution] ?? DEFAULT_STUDY_PERIODS[institution];
export const studyTotalRounds = (
  config: PeriodConfig & Pick<RoomConfig, "studyInstitutions">,
) =>
  studyInstitutions(config).reduce(
    (sum, i) => sum + studyPeriodCount(config, i),
    0,
  );

export function studyPeriodsError(
  periods: Partial<StudyPeriods>,
  institutions: readonly Institution[],
) {
  return institutions.some((i) => {
    const count = studyPeriodCount({ studyPeriods: periods }, i);
    return (
      !Number.isInteger(count) || count < 1 || count > MAX_INSTITUTION_PERIODS
    );
  })
    ? `各制度の期数は1〜${MAX_INSTITUTION_PERIODS}期の整数で設定してください。`
    : "";
}

export function studyPeriodRanges(
  config: PeriodConfig,
  order: readonly Institution[],
) {
  let first = 1;
  return order.map((institution) => {
    const periods = studyPeriodCount(config, institution);
    const range = { institution, first, last: first + periods - 1, periods };
    first += periods;
    return range;
  });
}

export function studyPeriodAt(
  config: PeriodConfig,
  order: readonly Institution[],
  round: number,
) {
  const ranges = studyPeriodRanges(config, order);
  const current = Math.max(1, round);
  const range = ranges.find((r) => current <= r.last) ?? ranges.at(-1)!;
  return { ...range, period: current - range.first + 1 };
}

export function studyInstitutionOrders(
  institutions: readonly Institution[],
): Institution[][] {
  if (institutions.length <= 1) return [[...institutions]];
  return institutions.flatMap((first) =>
    studyInstitutionOrders(institutions.filter((i) => i !== first)).map(
      (rest) => [first, ...rest],
    ),
  );
}

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
