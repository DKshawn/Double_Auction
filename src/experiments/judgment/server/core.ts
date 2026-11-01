import { randomInt, randomUUID } from "node:crypto";
import {
  catalog,
  publicTrial as originalTrial,
  analyze as originalAnalyze,
} from "../vendor/server/protocols.mjs";
import { classroomProtocol as originalProtocol } from "../vendor/server/classroom.mjs";
import {
  fingerprint as originalFingerprint,
  rng,
  shuffle,
  AppError,
  validateAnswer as originalAnswer,
  validateMetrics as originalMetrics,
  csv,
} from "../vendor/server/engine.mjs";
import {
  localizeTrial as originalLocalize,
  TRANSLATION_VERSION,
} from "../vendor/public/i18n.js";
import { debriefForShown } from "../vendor/public/debrief.js";
import type {
  Answer,
  Language,
  Lesson,
  Metrics,
  PreviewProtocol,
  Protocol,
  ResponseRecord,
  Run,
  RunView,
  Settings,
  Step,
  Study,
  Submission,
  Trial,
} from "../types";
export { AppError, csv, TRANSLATION_VERSION };
// PostgreSQL jsonb reorders object keys; canonical hashes survive round trips.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export const fingerprint = (value: unknown): string =>
  originalFingerprint(canonical(value));
export const SOURCE_COMMIT = "bd28b3460366671917b477d590c2be0a274f867b";
const generate = originalProtocol as (
  id: string,
  seed: number,
  choices: boolean,
) => Protocol;
export const present = originalTrial as (
  protocol: Protocol,
  index: number,
  responses: ResponseRecord[],
) => Trial | null;
const validateAnswer = originalAnswer as (
  trial: Trial,
  answer: unknown,
) => Answer;
const validateMetrics = originalMetrics as unknown as (
  metrics: unknown,
  minimum: number,
  window: number,
) => Metrics;
const localize = originalLocalize as (
  trial: Trial,
  language: Language,
) => Trial;
const analyze = originalAnalyze as (
  protocol: Protocol,
  responses: ResponseRecord[],
) => unknown;
export const studies: Study[] = catalog.studies
  .filter((s) => s.classroomEnabled)
  .map((s) => ({ id: s.id, names: s.names, description: s.original }));
const seed = () => randomInt(0, 2 ** 32);
export function validateSettings(settings: Settings) {
  if (
    !settings ||
    !Array.isArray(settings.studyIds) ||
    !settings.studyIds.length ||
    settings.studyIds.length > studies.length ||
    new Set(settings.studyIds).size !== settings.studyIds.length ||
    settings.studyIds.some((id) => !studies.some((s) => s.id === id)) ||
    typeof settings.randomizeExperiments !== "boolean" ||
    typeof settings.randomizeChoices !== "boolean"
  )
    throw new AppError("実施できる課題を選択してください。", 400);
  // With shuffling off, chapter order is deterministic regardless of checkbox click order.
  return {
    ...settings,
    studyIds: studies
      .filter((s) => settings.studyIds.includes(s.id))
      .map((s) => s.id),
  };
}
export function preview(settings: Settings): PreviewProtocol[] {
  settings = validateSettings(settings);
  const ids = settings.randomizeExperiments
    ? shuffle(settings.studyIds, rng(seed()))
    : settings.studyIds;
  return ids.map((id) => ({
    studyId: id,
    trials: generate(id, seed(), settings.randomizeChoices).trials,
  }));
}
export function makeRun(lesson: Lesson, studentId: string, now: number): Run {
  const orderSeed = seed(),
    settings = lesson.settings;
  const ids = settings.randomizeExperiments
    ? shuffle(settings.studyIds, rng(orderSeed))
    : settings.studyIds;
  let startIndex = 0;
  const steps: Step[] = ids.map((studyId) => {
    const protocolSeed = seed(),
      protocol = generate(studyId, protocolSeed, settings.randomizeChoices);
    const step: Step = {
      id: randomUUID(),
      studyId,
      seed: protocolSeed,
      protocol,
      protocolHash: fingerprint(protocol),
      startIndex,
      currentIndex: 0,
      presentedAt: null,
      status: "active",
      responses: [],
    };
    startIndex += protocol.trials.length;
    return step;
  });
  return {
    id: randomUUID(),
    lessonId: lesson.id,
    studentId,
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    status: "active",
    orderSeed,
    manifestHash: fingerprint(manifest(steps)),
    steps,
  };
}
export const manifest = (steps: Step[]) =>
  steps.map((s) => ({
    studyId: s.studyId,
    sessionId: s.id,
    startIndex: s.startIndex,
    trialCount: s.protocol.trials.length,
    protocolHash: s.protocolHash,
  }));
export function state(run: Run, now: number): RunView {
  const next =
    run.status === "active"
      ? run.steps.find((s) => s.status === "active")
      : undefined;
  if (next && next.presentedAt === null) {
    next.presentedAt = now;
    run.updatedAt = now;
  }
  const shown = (studyId: string, trialId: string) => {
    const step = run.steps.find((s) => s.studyId === studyId);
    if (!step) return false;
    const index = step.protocol.trials.findIndex((t) => t.id === trialId);
    return (
      index >= 0 &&
      (step.currentIndex > index ||
        (step.currentIndex === index && step.presentedAt !== null))
    );
  };
  return {
    id: run.id,
    studentId: run.studentId,
    status: run.status,
    currentIndex: run.steps.reduce((n, s) => n + s.currentIndex, 0),
    totalTrials: run.steps.reduce((n, s) => n + s.protocol.trials.length, 0),
    trial: next
      ? present(next.protocol, next.currentIndex, next.responses)
      : null,
    pairSetup: false,
    pairCode: null,
    debrief: run.status === "active" ? null : debriefForShown(shown),
  };
}
export function submit(run: Run, payload: Submission, now: number) {
  const step = run.steps.find(
    (s) =>
      payload.trialIndex >= s.startIndex &&
      payload.trialIndex < s.startIndex + s.protocol.trials.length,
  );
  if (!step) throw new AppError("回答の順番が一致しません。", 409);
  const payloadHash = fingerprint(payload),
    prior = run.steps
      .flatMap((s) => s.responses)
      .find((r) => r.submissionId === payload.submissionId);
  if (prior) {
    if (prior.payloadHash !== payloadHash)
      throw new AppError("同じ送信IDの内容が変更されています。", 409);
    return state(run, now);
  }
  if (
    run.status !== "active" ||
    run.steps.find((s) => s.status === "active") !== step ||
    payload.trialIndex !== step.startIndex + step.currentIndex
  )
    throw new AppError("回答済みの項目は変更できません。", 409);
  const trial = present(step.protocol, step.currentIndex, step.responses);
  if (!trial || trial.id !== payload.trialId)
    throw new AppError("表示中の項目と回答が一致しません。", 409);
  const answer = validateAnswer(trial, payload.answer),
    metrics = validateMetrics(
      payload.metrics,
      trial.minViewMs ?? 0,
      trial.responseWindowMs ?? 0,
    );
  if (
    step.studyId === "12-01" &&
    trial.id === "conversation" &&
    answer.partnerStudentId === run.studentId
  )
    throw new AppError("相手の学生証番号を入力してください。");
  if (
    step.presentedAt === null ||
    now - step.presentedAt + 100 < (trial.minViewMs ?? 0)
  )
    throw new AppError("刺激を確認してから進んでください。");
  if (trial.responseWindowMs) {
    if (metrics.timed?.endReason === "submitted" && answer.estimate === null)
      throw new AppError("この項目に回答してください。");
    if (metrics.timed?.endReason === "interrupted" && answer.estimate !== null)
      throw new AppError("制限時間の記録を確認してください。");
    if (
      metrics.timed?.endReason === "deadline" &&
      now - step.presentedAt + 100 < trial.responseWindowMs
    )
      throw new AppError("制限時間の記録を確認してください。");
  }
  if (metrics.language && metrics.languageHistory)
    metrics.presentations = [
      ...new Set(metrics.languageHistory.map((h) => h.language)),
    ].map((language) => {
      const localized = localize(trial, language);
      return {
        language,
        translationVersion: metrics.translationVersion,
        trial: localized,
        hash: fingerprint(localized),
      };
    });
  step.responses.push({
    trialIndex: step.currentIndex,
    trialId: trial.id,
    submissionId: payload.submissionId,
    payloadHash,
    answer,
    metrics,
    presentedAt: step.presentedAt,
    receivedAt: now,
  });
  step.currentIndex++;
  step.presentedAt = null;
  if (step.currentIndex === step.protocol.trials.length)
    step.status = "completed";
  run.updatedAt = now;
  if (run.steps.every((s) => s.status === "completed")) {
    run.status = "completed";
    run.endedAt = now;
  }
  return state(run, now);
}
export function withdraw(run: Run, now: number) {
  if (run.status === "active") {
    run.status = "withdrawn";
    run.endedAt = now;
    run.updatedAt = now;
    run.steps.forEach((step) => {
      if (step.status === "active") step.status = "withdrawn";
    });
  }
  return state(run, now);
}
export function records(run: Run) {
  return {
    id: run.id,
    studentId: run.studentId,
    lessonId: run.lessonId,
    status: run.status,
    createdAt: run.createdAt,
    endedAt: run.endedAt,
    orderSeed: run.orderSeed,
    manifestHash: run.manifestHash,
    steps: manifest(run.steps),
    sessions: run.steps.map((s) => ({
      id: s.id,
      studyId: s.studyId,
      seed: s.seed,
      condition: s.protocol.condition,
      protocolHash: s.protocolHash,
      protocol: s.protocol,
      status: s.status,
      responses: s.responses.map((response) => ({
        trialIndex: response.trialIndex,
        trialId: response.trialId,
        submissionId: response.submissionId,
        answer: response.answer,
        metrics: response.metrics,
        presentedAt: response.presentedAt,
        receivedAt: response.receivedAt,
      })),
      analysis: analyze(s.protocol, s.responses),
    })),
  };
}
export function conversationPairs(runs: Run[]) {
  const rows = runs.flatMap((run) =>
    run.steps
      .filter((s) => s.studyId === "12-01")
      .flatMap((s) =>
        s.responses
          .filter((r) => r.trialId === "conversation")
          .map((r) => ({
            lessonId: run.lessonId,
            studentId: run.studentId,
            sessionId: s.id,
            ...r.answer,
          })),
      ),
  ) as {
    lessonId: string;
    studentId: string;
    sessionId: string;
    partnerStudentId: string;
    selfSpeakingPercent: number;
    partnerSpeakingPercent: number;
  }[];
  const index = new Map(rows.map((r) => [r.lessonId + ":" + r.studentId, r]));
  const used = new Set<string>();
  const paired = [],
    unpaired = [];
  for (const a of rows) {
    if (used.has(a.sessionId)) continue;
    const b = index.get(a.lessonId + ":" + a.partnerStudentId);
    if (
      !b ||
      b.partnerStudentId !== a.studentId ||
      b.studentId === a.studentId
    ) {
      unpaired.push({
        ...a,
        reason: !b ? "partner-response-missing" : "nonreciprocal-partner-id",
      });
      continue;
    }
    used.add(a.sessionId);
    used.add(b.sessionId);
    const relativeSelfEstimates = [
      a.selfSpeakingPercent - b.partnerSpeakingPercent,
      b.selfSpeakingPercent - a.partnerSpeakingPercent,
    ];
    paired.push({
      lessonId: a.lessonId,
      members: [a, b],
      relativeSelfEstimates,
      meanRelativeSelfEstimate:
        (relativeSelfEstimates[0] + relativeSelfEstimates[1]) / 2,
      selfEstimateSumExcess:
        a.selfSpeakingPercent + b.selfSpeakingPercent - 100,
      withinResponseSums: [
        a.selfSpeakingPercent + a.partnerSpeakingPercent,
        b.selfSpeakingPercent + b.partnerSpeakingPercent,
      ],
    });
  }
  return { paired, unpaired };
}
