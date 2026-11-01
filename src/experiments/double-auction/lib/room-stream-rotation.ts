import { studyPeriodAt } from "./study-config";
import { studyTiming } from "./study-timing";
import type { RoomView } from "./types";

export const STREAM_ROTATE_MS = 240_000;
// Leave time for the replacement snapshot and a margin below maxDuration=300.
export const STREAM_LATEST_ROTATE_MS = 280_000;
export const STREAM_HANDOFF_GRACE_MS = 10_000;
export type RotationPlan = { delay: number; reason: "period" | "timeout" };

/** One planner per HTTP connection; reconnecting during End never loops. */
export class RoomStreamRotation {
  private previousKey: string | undefined;

  observe(view: RoomView, elapsed: number): RotationPlan {
    const market = view.study?.market;
    const previousKey = this.previousKey;
    this.previousKey = market ? `${market.id}:${market.stageKey}` : undefined;
    const timed: RotationPlan = {
      delay: Math.max(0, STREAM_ROTATE_MS - elapsed),
      reason: "timeout",
    };
    // Teacher feeds cover independently advancing markets; they use the timer.
    if (!market || view.me.role === "teacher") return timed;
    const cdaMs = studyTiming(view.config).cdaSeconds * 1000;
    if (cdaMs > STREAM_ROTATE_MS) return timed;
    const nextIsCda =
      market.round < view.config.rounds &&
      studyPeriodAt(view.config, market.order, market.round + 1).institution ===
        "cda";
    const transition =
      (market.stage === "countdown" && market.institution === "cda") ||
      (market.stage === "feedback" &&
        (market.institution === "cda" || nextIsCda));
    if (
      transition &&
      ["running", "paused"].includes(view.phase) &&
      previousKey &&
      previousKey !== this.previousKey
    )
      return { delay: 0, reason: "period" };

    if (view.phase !== "running" || market.deadline === null) return timed;
    const untilDeadline = Math.max(0, market.deadline - view.serverTime);
    const untilEnd =
      market.stage === "cda"
        ? untilDeadline
        : (market.stage === "countdown" && market.institution === "cda") ||
            (market.stage === "feedback" && nextIsCda)
          ? untilDeadline + cdaMs
          : null;
    // A 240-second period plus its Start/End screen can exceed four minutes.
    // Wait for its authoritative End event, with a bounded fallback if it is lost.
    if (
      untilEnd !== null &&
      elapsed + untilEnd + 2000 <= STREAM_LATEST_ROTATE_MS
    )
      return {
        delay: Math.max(timed.delay, untilEnd + 2000),
        reason: "timeout",
      };
    return timed;
  }
}
