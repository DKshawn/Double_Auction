export type Language = "ja" | "zh" | "en";
export type Settings = {
  studyIds: string[];
  randomizeExperiments: boolean;
  randomizeChoices: boolean;
};
export type Study = {
  id: string;
  names: Record<Language, string>;
  description: Record<Language, string>;
};
export type Field = {
  id: string;
  type: string;
  label: string;
  [key: string]: unknown;
};
export type Trial = {
  id: string;
  title: string;
  fields: Field[];
  minViewMs?: number;
  responseWindowMs?: number;
  [key: string]: unknown;
};
export type Protocol = {
  studyId: string;
  version: string;
  seed: number;
  condition: string;
  trials: Trial[];
  presentation?: { optionOrders: unknown };
  [key: string]: unknown;
};
export type Answer = Record<string, unknown>;
export type Metrics = {
  rtMs: number;
  activeMs: number;
  focusLosses: number;
  reloadCount: number;
  language?: Language;
  translationVersion?: string;
  languageHistory?: { language: Language; atActiveMs: number }[];
  timed?: { limitMs: number; elapsedMs: number; endReason: string };
  presentations?: {
    language: Language;
    translationVersion?: string;
    trial: Trial;
    hash: string;
  }[];
  [key: string]: unknown;
};
export type ResponseRecord = {
  trialIndex: number;
  trialId: string;
  submissionId: string;
  payloadHash: string;
  answer: Answer;
  metrics: Metrics;
  presentedAt: number;
  receivedAt: number;
};
export type RunStatus = "active" | "completed" | "withdrawn";
export type Step = {
  id: string;
  studyId: string;
  seed: number;
  protocol: Protocol;
  protocolHash: string;
  startIndex: number;
  currentIndex: number;
  presentedAt: number | null;
  status: RunStatus;
  responses: ResponseRecord[];
};
export type Run = {
  id: string;
  lessonId: string;
  studentId: string;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
  status: RunStatus;
  orderSeed: number;
  manifestHash: string;
  steps: Step[];
};
export type RunView = {
  id: string;
  studentId: string;
  status: RunStatus;
  currentIndex: number;
  totalTrials: number;
  trial: Trial | null;
  pairSetup: false;
  pairCode: null;
  debrief: string[] | null;
};
export type Room = {
  code: string;
  title: string;
  createdAt: number;
  revision: number;
  passwordHash: string;
  tokenHash: string;
  settings: Settings;
  activeLesson: string | null;
  lessonCount: number;
};
export type Lesson = {
  id: string;
  number: number;
  status: "active" | "ended";
  createdAt: number;
  endedAt: number | null;
  settings: Settings;
  settingsHash: string;
};
export type Participant = {
  id: string;
  studentId: string;
  pinHash: string;
  tokenHash: string;
  joinedAt: number;
  lastSeen: number;
};
export type StudentView = {
  phase: "waiting" | "running" | "finished";
  studentId: string;
  lesson: Pick<Lesson, "id" | "status" | "createdAt" | "endedAt"> | null;
  run: RunView | null;
};
export type TeacherView = {
  code: string;
  title: string;
  revision: number;
  settings: Settings;
  lesson: Lesson | null;
  history: Lesson[];
  students: {
    studentId: string;
    lastSeen: number;
    runId: string | null;
    status: RunStatus | null;
    answered: number;
    totalTrials: number;
  }[];
};
export type Submission = {
  trialIndex: number;
  trialId: string;
  submissionId: string;
  answer: Answer;
  metrics: Record<string, unknown>;
};
export type PreviewProtocol = { studyId: string; trials: Trial[] };
