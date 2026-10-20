import type { GoodId } from "./catalog";
import type {
  Institution,
  StudyCommand,
  StudyTiming,
  StudyPeriods,
  StudyView,
} from "./study-types";

export type Role = "buyer" | "seller";
export type Phase = "waiting" | "running" | "paused" | "review" | "finished";
export type MarketSettings = Record<
  GoodId,
  { values: number[]; costs: number[] }
>;
export type RoomConfig = {
  protocol?: "institutions-v1";
  markets?: number;
  marketSize?: number;
  studyAdmission?: "flexible";
  // Missing on saved rooms, whose explicitly requested market count is retained.
  studyMarketMode?: "auto" | "manual";
  // Creation-dialog review state only; admission and start still require server validation.
  studySetupConfirmed?: boolean;
  // Final seats, recorded at admission close. marketSize remains the condition template size.
  studyLayout?: { buyers: number; sellers: number }[];
  studyTiming?: StudyTiming;
  // Absent on old rooms, whose saved sequential protocol remains readable.
  studyPostedMechanism?: "batch-bids-v1";
  studyInstitutions?: Institution[];
  studyPeriods?: Partial<StudyPeriods>;
  studyCommission?: number;
  studyCdaUnits?: number;
  studyUnitCounts?: Partial<Record<Institution, number>>;
  title: string;
  capacity: number;
  rounds: number;
  duration: number;
};
export type Quote = {
  id: string;
  participantId: string;
  alias: string;
  side: Role;
  good: GoodId;
  price: number;
  sequence: number;
  at: number;
  round: number;
};
export type Trade = {
  id: string;
  sequence: number;
  good: GoodId;
  price: number;
  buyerId: string;
  sellerId: string;
  buyerAlias: string;
  sellerAlias: string;
  round: number;
  at: number;
};
export type Equilibrium = {
  low: number;
  high: number;
  quantity: number;
  quantityMax: number;
  surplus: number;
};
export type RoundMetric = {
  round: number;
  quantity: number;
  mean: number | null;
  deviation: number | null;
  efficiency: number | null;
};
export type RoomView = {
  study?: StudyView;
  code: string;
  config: RoomConfig;
  phase: Phase;
  round: number;
  version: number;
  deadline: number | null;
  remainingMs: number;
  serverTime: number;
  participantCount: number;
  quotes: Quote[];
  trades: Trade[];
  mode: "local" | "online";
  me: {
    withdrawnAt?: number;
    id: string;
    alias: string;
    nickname: string;
    role: Role | "teacher";
    limits: Record<GoodId, number> | null;
    used: GoodId[];
    profit: number;
    roundProfit: number;
  };
  teacher?: {
    marketSettings: MarketSettings;
    settingsRevision: number;
    participants: {
      id: string;
      alias: string;
      nickname: string;
      role: Role;
      limits: Record<GoodId, number>;
      profit: number;
    }[];
    equilibria: Record<GoodId, Equilibrium>;
    metrics: Record<GoodId, RoundMetric[]>;
    schedules: Record<GoodId, { values: number[]; costs: number[] }>;
  };
};

export type LegacyCommand =
  | {
      type: "update-markets";
      settings: MarketSettings;
      expectedRevision: number;
    }
  | { type: "quote"; good: GoodId; price: number }
  | { type: "cancel"; good: GoodId }
  | { type: "accept"; quoteId: string }
  | { type: "start" | "pause" | "resume" | "end-round" | "finish" };
export type Command = LegacyCommand | StudyCommand;
export type CommandRequest = {
  requestId: string;
  expectedRound: number;
  expectedStage?: string;
  command: Command;
};
