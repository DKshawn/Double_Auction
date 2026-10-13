export type Institution = "cda" | "call" | "posted";
export type StudyPeriods = Record<Institution, number>;
export type UnitPair = [number, number];
export type StudyTiming = {
  cdaSeconds: number;
  callSeconds: number;
  offerSeconds: number;
  buyerSeconds: number;
};
export type StudySettings = { values: UnitPair[]; costs: UnitPair[] };
export type StaircaseParameters = {
  p: number;
  K: number;
  L: number;
  d: number;
};
export type StudyGeneratorConfig = {
  kind: "overlap-staircase";
  parameters: StaircaseParameters;
  seed: number;
};
export type StudyGeneratedAssignment = {
  participantId: string;
  nickname: string;
  market: number;
  seat: number;
  alias: string;
  role: "buyer" | "seller";
  sortedUnits: UnitPair;
  limits: UnitPair;
};
export type StudyGeneration = StudyGeneratorConfig & {
  appliedAt: number;
  assignmentConfirmedAt: number | null;
  assignments: StudyGeneratedAssignment[];
};
export type StudyStage =
  | "waiting"
  | "countdown"
  | "cda"
  | "call"
  | "offer"
  | "purchase"
  | "feedback"
  | "done";
export type StudyLobby = {
  revision: number;
  randomizedAt: number | null;
};
export const STUDY_START_SECONDS = 5;
export const STUDY_FEEDBACK_SECONDS = 8;
export type StudyOrder = {
  id: string;
  participantId: string;
  alias: string;
  side: "buyer" | "seller";
  price: number;
  unit: number;
  sequence: number;
  at: number;
};
export type StudyOrderHistory = StudyOrder & {
  round: number;
  status: "replaced" | "cancelled" | "filled" | "expired" | "interrupted";
  closedAt: number;
  closedSequence: number;
};
export type PostedOffer = {
  id: string;
  participantId: string;
  alias: string;
  price: number;
  quantity: number;
  remaining: number;
};
export type PostedOfferHistory = Omit<PostedOffer, "remaining"> & {
  round: number;
  at: number;
  sequence: number;
};
export type StudyTrade = {
  id: string;
  sequence: number;
  at: number;
  round: number;
  market: number;
  institution: Institution;
  call: number | null;
  price: number;
  buyerId: string;
  sellerId: string;
  buyerAlias: string;
  sellerAlias: string;
  buyerUnit: number;
  sellerUnit: number;
  value: number;
  cost: number;
  // Reward to each party for this filled unit; absent on pre-commission fills.
  commission?: number;
};
export type Clearing = {
  round: number;
  call: number;
  at: number;
  price: number | null;
  quantity: number;
};
export type StudyMetric = {
  market: number;
  round: number;
  institution: Institution;
  institutionPeriod: number;
  completion: "running" | "complete" | "interrupted";
  quantity: number;
  quantityRatio: number | null;
  mean: number | null;
  deviation: number | null;
  alpha: number | null;
  surplus: number;
  commissionPaid: number;
  efficiency: number | null;
  inefficientTrades: number;
  spread: number | null;
  spreadObservedMs: number;
};
export type StudyMarketView = {
  id: number;
  round: number;
  order: Institution[];
  institution: Institution;
  institutionPeriod: number;
  stage: StudyStage;
  stageKey: string;
  deadline: number | null;
  remainingMs: number;
  call: number;
  participantCount: number;
  activeBuyer: string | null;
  orders: StudyOrder[];
  orderHistory: StudyOrderHistory[];
  offers: PostedOffer[];
  offerHistory: PostedOfferHistory[];
  clearings: Clearing[];
  trades: Omit<StudyTrade, "value" | "cost">[];
  myOrders: StudyOrder[];
  submitted: boolean;
  myOffer: PostedOffer | null;
};
export type StudyView = {
  protocol: "institutions-v1";
  lobby?: StudyLobby;
  marketCount: number;
  settingsRevision: number;
  market: StudyMarketView;
  unitLimits: UnitPair | null;
  unitsUsed: number;
  myTrades: {
    id: string;
    round: number;
    institution: Institution;
    price: number;
    unit: number;
    profit: number;
    commission?: number;
  }[];
  // Keep own fills available to notifications even after the visible institution changes.
  myTradeNotifications?: StudyView["myTrades"];
  teacher?: {
    settings: StudySettings;
    preset?: { label: string; settings: StudySettings };
    generation?: StudyGeneration;
    markets: StudyMarketView[];
    participants: {
      id: string;
      market: number;
      nickname: string;
      alias: string;
      role: "buyer" | "seller";
      limits: UnitPair;
      profit: number;
      joinOrder: number;
      joinedAt?: number;
    }[];
    metrics: StudyMetric[];
    slopes: {
      market: number;
      institution: Institution;
      n: number;
      slope: number | null;
    }[];
    equilibrium: {
      low: number;
      high: number;
      quantity: number;
      quantityMax: number;
      surplus: number;
    };
  };
};
export type StudyCommand =
  | { type: "study-randomize"; expectedRevision: number }
  | { type: "study-commission"; commission: number; expectedRevision: number }
  | {
      type: "study-timing";
      timing: StudyTiming;
      expectedRevision: number;
    }
  | {
      type: "study-settings";
      settings: StudySettings;
      generator?: StudyGeneratorConfig;
      commission?: number;
      expectedRevision: number;
    }
  | { type: "study-quote"; price: number }
  | { type: "study-cancel" }
  | { type: "study-accept"; orderId: string }
  | { type: "call-submit"; prices: number[] }
  | { type: "posted-offer"; price: number; quantity: number }
  | { type: "posted-buy"; offerId: string; quantity: number }
  | { type: "posted-pass" };
