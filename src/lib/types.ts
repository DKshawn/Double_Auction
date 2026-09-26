import type { GoodId } from "./catalog";

export type Role = "buyer" | "seller";
export type Phase = "waiting" | "running" | "paused" | "review" | "finished";
export type RoomConfig = {
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
  surplus: number;
};
export type RoundMetric = {
  round: number;
  quantity: number;
  mean: number | null;
  deviation: number | null;
  efficiency: number;
};
export type RoomView = {
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

export type Command =
  | { type: "quote"; good: GoodId; price: number }
  | { type: "cancel"; good: GoodId }
  | { type: "accept"; quoteId: string }
  | { type: "start" | "pause" | "resume" | "end-round" | "finish" };
export type CommandRequest = {
  requestId: string;
  expectedRound: number;
  command: Command;
};
