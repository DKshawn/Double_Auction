"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { Command, RoomView } from "@/lib/types";
import { MAX_STUDY_MARKETS } from "@/lib/study-config";

export function StudyAdmission({
  view,
  now,
  command,
  disabled,
  marketDraft,
  onMarketDraftChange,
  section = "all",
}: {
  view: RoomView;
  now: number;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
  marketDraft: string | null;
  onMarketDraftChange: Dispatch<SetStateAction<string | null>>;
  section?: "all" | "markets" | "deadline";
}) {
  const lobby = view.study!.lobby!,
    admission = lobby.admission;
  const markets =
    marketDraft ?? String(admission?.targetMarkets ?? view.config.markets ?? 1);
  const marketCount = Number(markets);
  const validMarkets =
    Number.isInteger(marketCount) &&
    marketCount >= 1 &&
    marketCount <= MAX_STUDY_MARKETS;
  const [savingMarkets, setSavingMarkets] = useState(false);
  const lastAttempt = useRef<{ markets: number; revision: number } | null>(
    null,
  );
  const [secondsDraft, setSecondsDraft] = useState<string | null>(null);
  const seconds = secondsDraft ?? String(admission?.timerSeconds ?? 60);
  const timerId = useId();
  const running = admission?.closesAt != null;
  const paused = admission?.pausedRemainingMs !== undefined;
  const remainingSeconds = Math.max(
    0,
    Math.ceil(
      (running
        ? admission!.closesAt! - now
        : (admission?.pausedRemainingMs ?? 0)) / 1000,
    ),
  );
  const saveMarkets = useEffectEvent(async () => {
    if (disabled || admission?.status !== "open") return;
    lastAttempt.current = { markets: marketCount, revision: lobby.revision };
    setSavingMarkets(true);
    try {
      const saved = await command({
        type: "study-admission",
        action: "configure",
        markets: marketCount,
        expectedRevision: lobby.revision,
      });
      if (saved)
        onMarketDraftChange((current) =>
          Number(current) === marketCount ? null : current,
        );
    } finally {
      setSavingMarkets(false);
    }
  });
  useEffect(() => {
    if (
      disabled ||
      section === "deadline" ||
      admission?.status !== "open" ||
      !validMarkets ||
      marketCount === admission.targetMarkets ||
      (lastAttempt.current?.markets === marketCount &&
        lastAttempt.current.revision === lobby.revision)
    )
      return;
    const timer = window.setTimeout(() => void saveMarkets(), 400);
    return () => window.clearTimeout(timer);
  }, [
    markets,
    section,
    marketCount,
    validMarkets,
    disabled,
    admission?.status,
    admission?.targetMarkets,
    lobby.revision,
  ]);
  const send = (
    action: Extract<Command, { type: "study-admission" }>["action"],
  ) =>
    command({
      type: "study-admission",
      action,
      expectedRevision: lobby.revision,
      ...(action === "schedule" || action === "close"
        ? { markets: marketCount }
        : {}),
      ...(action === "schedule" ? { seconds: Number(seconds) } : {}),
    });
  if (!admission)
    return (
      <button
        className="button secondary"
        disabled={disabled}
        onClick={() => void send("open")}
      >
        人数を確定せず入室を受け付ける
      </button>
    );
  return (
    <section className="study-admission" aria-label="入室受付の設定">
      <div className="study-admission-controls">
        {section !== "deadline" && (
          <label className="field">
            市場数
            <input
              type="number"
              min={1}
              max={MAX_STUDY_MARKETS}
              step={1}
              value={markets}
              disabled={
                (disabled && !savingMarkets) || admission.status !== "open"
              }
              onChange={(e) => {
                lastAttempt.current = null;
                onMarketDraftChange(e.target.value);
              }}
            />
          </label>
        )}
        {section !== "markets" &&
          (admission.status === "open" ? (
            <>
              <div className="study-admission-timer-field">
                <span id={timerId}>入室受付時間（秒）</span>
                <div
                  className="study-admission-timer"
                  role="group"
                  aria-labelledby={timerId}
                >
                  {running || paused ? (
                    <output
                      className="study-admission-countdown"
                      role="timer"
                      aria-label={
                        paused ? "入室締切まで（一時停止中）" : "入室締切まで"
                      }
                    >
                      {remainingSeconds}
                    </output>
                  ) : (
                    <input
                      aria-labelledby={timerId}
                      type="number"
                      min={5}
                      max={3600}
                      step={1}
                      value={seconds}
                      disabled={disabled}
                      onChange={(e) => setSecondsDraft(e.target.value)}
                    />
                  )}
                  <button
                    type="button"
                    className="study-admission-timer-action"
                    aria-label={
                      paused ? "締切タイマーを再開" : "締切タイマーを開始"
                    }
                    title={paused ? "再開" : "開始"}
                    disabled={
                      disabled ||
                      running ||
                      (!paused &&
                        (!validMarkets ||
                          !Number.isInteger(Number(seconds)) ||
                          Number(seconds) < 5 ||
                          Number(seconds) > 3600))
                    }
                    onClick={async () => {
                      if (await send(paused ? "resume-timer" : "schedule"))
                        setSecondsDraft(null);
                    }}
                  >
                    <Play size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="study-admission-timer-action"
                    aria-label="締切タイマーを一時停止"
                    title="一時停止"
                    disabled={disabled || !running}
                    onClick={() => void send("pause-timer")}
                  >
                    <Pause size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="study-admission-timer-action"
                    aria-label="締切タイマーをリセット"
                    title="リセット"
                    disabled={disabled || (!running && !paused)}
                    onClick={async () => {
                      if (await send("cancel-timer")) setSecondsDraft(null);
                    }}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <button
                className="button primary"
                disabled={
                  disabled || !validMarkets || view.participantCount < 2
                }
                onClick={() => void send("close")}
              >
                入室を締め切って割り当て
              </button>
            </>
          ) : (
            <button
              className="button secondary"
              disabled={disabled}
              onClick={() => void send("open")}
            >
              入室を再開
            </button>
          ))}
      </div>
      {admission.error && (
        <p className="error-message" role="alert">
          {admission.error}
        </p>
      )}
    </section>
  );
}
