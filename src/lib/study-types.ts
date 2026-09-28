export type Institution = "cda" | "call" | "posted";
export type UnitPair = [number, number];
export type StudySettings = { values: UnitPair[]; costs: UnitPair[] };
export type StudyStage =
  "waiting" | "cda" | "call" | "offer" | "purchase" | "done";
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
export type PostedOffer = {
  id: string;
  participantId: string;
  alias: string;
  price: number;
  quantity: number;
  remaining: number;
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
  efficiency: number | null;
  inefficientTrades: number;
  spread: number | null;
  spreadObservedMs: number;
};
export type StudyMarketView = {
  id: number;
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
  offers: PostedOffer[];
  clearings: Clearing[];
  trades: Omit<StudyTrade, "value" | "cost">[];
  myOrders: StudyOrder[];
  submitted: boolean;
  myOffer: PostedOffer | null;
};
export type StudyView = {
  protocol: "institutions-v1";
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
  }[];
  teacher?: {
    settings: StudySettings;
    markets: StudyMarketView[];
    participants: {
      id: string;
      market: number;
      nickname: string;
      alias: string;
      role: "buyer" | "seller";
      limits: UnitPair;
      profit: number;
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
  | {
      type: "study-settings";
      settings: StudySettings;
      expectedRevision: number;
    }
  | { type: "study-quote"; price: number }
  | { type: "study-cancel" }
  | { type: "study-accept"; orderId: string }
  | { type: "call-submit"; prices: number[] }
  | { type: "posted-offer"; price: number; quantity: number }
  | { type: "posted-buy"; offerId: string; quantity: number }
  | { type: "posted-pass" };
