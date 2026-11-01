"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Pause,
  Play,
  SkipForward,
  Users,
  WifiOff,
  Radio,
  Eye,
  LockKeyhole,
} from "lucide-react";
import type { RoomView, TeacherAction } from "@/experiments/emh/types";
import {
  ExportPanel,
  fmt,
  HistoryPanel,
  OrderPanel,
  ParticipantsPanel,
  ResultsPanel,
  type RunAction,
} from "./market-panels";

export function useClock(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const received = Date.now();
    const timer = setInterval(
      () => setNow(serverNow + Date.now() - received),
      200,
    );
    return () => clearInterval(timer);
  }, [serverNow]);
  return Math.max(serverNow, now);
}
const remaining = (deadline: number | null, now: number) =>
  Math.max(0, Math.ceil(((deadline ?? now) - now) / 1000));
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
export function RoomDashboard({
  room,
  act,
  busy = false,
  online = true,
  demo = false,
  showReveal = true,
}: {
  room: RoomView;
  act: RunAction;
  busy?: boolean;
  online?: boolean;
  demo?: boolean;
  showReveal?: boolean;
}) {
  const now = useClock(room.serverNow);
  const reference = room.pausedAt ?? now;
  const [tab, setTab] = useState<"market" | "results" | "people">("market");
  const [copied, setCopied] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    kind: "end-period" | "reveal";
    phase: string;
    year: number;
    period: string;
  } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmation && dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [confirmation]);
  const teacher = room.role === "teacher";
  const disabled = busy || !online;
  const active = room.status === "trading";
  const paused = room.pausedAt !== null;
  const status =
    room.status === "lobby"
      ? "参加者を受付中"
      : room.status === "completed"
        ? "実験終了"
        : paused
          ? "一時停止中"
          : room.status === "break"
            ? "休憩中"
            : "取引中";
  const control = (kind: TeacherAction["kind"]) =>
    act({ kind, expectedPhase: room.phaseKey });
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/room/${room.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <div className="room-heading">
        <div>
          <div className="room-context">
            {teacher
              ? "教員"
              : room.me?.seat
                ? `被験者 #${room.me.seat}`
                : room.me?.name}
            <span className="context-divider" />
            ルーム <strong className="mono">{room.code}</strong>
          </div>
          <h1>{room.title}</h1>
        </div>
        <div className="room-heading-right">
          <span className={`status ${paused ? "amber" : ""}`}>
            {online ? <span className="status-dot" /> : <WifiOff size={14} />}{" "}
            {online ? status : "再接続中"}
          </span>
          {teacher && !demo && (
            <button className="button secondary small" onClick={copy}>
              {copied ? <Check size={15} /> : <Copy size={15} />}参加リンク
            </button>
          )}
        </div>
      </div>
      {!online && (
        <p className="notice warning" role="status">
          通信を再接続しています。表示は最後に受信した状態です。取引は接続が戻るまで待ってください。
        </p>
      )}
      {room.status === "lobby" ? (
        <div className="lobby-layout">
          <section className="panel lobby-panel">
            <div className="lobby-title">
              <Users size={25} />
              <h2>
                {teacher
                  ? "参加者の入室を待っています"
                  : "まもなく実験が始まります"}
              </h2>
            </div>
            <div className="arrival-count">
              <strong>{room.participantCount}</strong>
              <span>人</span>
            </div>
            <div
              className="seats"
              aria-label={`${room.participantCount}人が参加済み`}
            >
              {Array.from(
                { length: Math.max(9, room.participantCount) },
                (_, i) => (
                  <div
                    key={i}
                    className={`seat ${i < room.participantCount ? "filled" : ""}`}
                  >
                    <Users size={21} />
                    {teacher && room.participants[i] ? (
                      <span>{room.participants[i]!.name}</span>
                    ) : (
                      <span>
                        {i < room.participantCount ? "参加済み" : "待機中"}
                      </span>
                    )}
                  </div>
                ),
              )}
            </div>
            <p className="muted">被験者番号と配当は、開始時に割り当てます。</p>
            {teacher && (
              <button
                className="button primary"
                disabled={disabled || room.participantCount < 3}
                onClick={() => control("start")}
              >
                <Play size={17} />
                実験を開始
              </button>
            )}
          </section>
          <aside className="panel lobby-settings">
            <h2>今回の実験</h2>
            <dl>
              <div>
                <dt>ラウンド</dt>
                <dd>{room.rounds}回</dd>
              </div>
              <div>
                <dt>各期</dt>
                <dd>{room.periodSeconds}秒</dd>
              </div>
              <div>
                <dt>1取引</dt>
                <dd>{room.unitSeconds}秒</dd>
              </div>
              <div>
                <dt>ラウンド間の休憩</dt>
                <dd>{room.breakSeconds}秒</dd>
              </div>
              <div>
                <dt>初期保有</dt>
                <dd>2単位</dd>
              </div>
            </dl>
            <p className="field-note">
              2回続けて取引が成立しなければ、その期を終了します。
            </p>
          </aside>
        </div>
      ) : (
        <>
          <div className="round-strip">
            {Array.from({ length: room.rounds }, (_, i) => (
              <div
                key={i}
                className={`round-step ${i + 1 < room.year || room.status === "completed" ? "done" : i + 1 === room.year ? "active" : ""}`}
              >
                <span>{i + 1}</span>
                <div>
                  <i
                    className={
                      i + 1 < room.year ||
                      (i + 1 === room.year &&
                        (room.period === "B" || room.status === "completed"))
                        ? "done"
                        : i + 1 === room.year
                          ? "active"
                          : ""
                    }
                  >
                    A
                  </i>
                  <i
                    className={
                      i + 1 < room.year ||
                      (i + 1 === room.year &&
                        (room.status === "break" ||
                          room.status === "completed"))
                        ? "done"
                        : i + 1 === room.year && room.period === "B"
                          ? "active"
                          : ""
                    }
                  >
                    B
                  </i>
                </div>
              </div>
            ))}
          </div>
          <div className="session-bar">
            <div className="session-phase">
              <span className="period-badge">{room.period}</span>
              <div>
                <span className="muted">第{room.year}ラウンド</span>
                <strong>
                  {room.status === "completed"
                    ? "すべての取引が終了"
                    : room.status === "break"
                      ? "次のラウンドまで"
                      : `Period ${room.period}`}
                </strong>
              </div>
            </div>
            <div className="timers">
              {room.status !== "completed" && (
                <>
                  <div>
                    <span>{room.status === "break" ? "休憩" : "期の残り"}</span>
                    <strong className="timer">
                      {clock(
                        remaining(
                          room.status === "break"
                            ? room.breakEndsAt
                            : room.periodEndsAt,
                          reference,
                        ),
                      )}
                    </strong>
                  </div>
                  {active && (
                    <div
                      className={
                        remaining(room.unitEndsAt, reference) <= 5
                          ? "urgent"
                          : ""
                      }
                    >
                      <span>この取引</span>
                      <strong className="timer small-timer">
                        {remaining(room.unitEndsAt, reference)}
                        <small>秒</small>
                      </strong>
                    </div>
                  )}
                </>
              )}
            </div>
            {teacher && room.status !== "completed" && (
              <div className="control-buttons">
                <button
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => control(paused ? "resume" : "pause")}
                >
                  {paused ? <Play size={16} /> : <Pause size={16} />}
                  <span>{paused ? "再開" : "一時停止"}</span>
                </button>
                {room.status === "break" ? (
                  <button
                    className="button secondary"
                    disabled={disabled || paused}
                    onClick={() => control("next-year")}
                  >
                    <SkipForward size={16} />
                    次へ
                  </button>
                ) : (
                  <button
                    className="button quiet"
                    disabled={disabled || paused}
                    onClick={() =>
                      setConfirmation({
                        kind: "end-period",
                        phase: room.phaseKey,
                        year: room.year,
                        period: room.period,
                      })
                    }
                  >
                    期を終了
                  </button>
                )}
              </div>
            )}
          </div>
          {room.status === "completed" ? (
            <div className="notice completion">
              <div>
                <Check size={20} />
                <span>
                  {teacher ? (
                    "実験が終了しました。結果と記録を確認できます。"
                  ) : (
                    <>
                      おつかれさまでした。あなたの累計得点は{" "}
                      <strong>{fmt(room.me?.totalProfit)}</strong> です。
                    </>
                  )}
                </span>
              </div>
              {teacher && showReveal && !room.reveal && (
                <button
                  className="button secondary small"
                  disabled={disabled}
                  onClick={() =>
                    setConfirmation({
                      kind: "reveal",
                      phase: room.phaseKey,
                      year: room.year,
                      period: room.period,
                    })
                  }
                >
                  <Eye size={15} />
                  解説を公開
                </button>
              )}
            </div>
          ) : room.status === "break" ? (
            <div className="notice">
              <span>
                第{room.year}
                ラウンドの得点が確定しました。次は証券を2単位ずつ受け取ります。
              </span>
            </div>
          ) : (
            <div className="market-note">
              <Radio size={14} />
              <span>
                {paused
                  ? "教員が再開するまでお待ちください。"
                  : `被験者 #${room.nominatedSeat} さん、最初の提示をお願いします。全員が取引できます。`}
              </span>
              {room.emptyUnits > 0 && (
                <span className="inactivity">前回は成立なし</span>
              )}
            </div>
          )}
          {!teacher && (
            <div className="stat-grid">
              <div>
                <span>保有証券</span>
                <strong>
                  {room.me?.holdings}
                  <small>単位</small>
                </strong>
              </div>
              <div>
                <span>売買収支</span>
                <strong>{fmt(room.me?.cash)}</strong>
              </div>
              <div>
                <span>ラウンド得点</span>
                <strong>
                  {fmt((room.me?.cash ?? 0) + (room.me?.dividend ?? 0))}
                </strong>
              </div>
              <div className="private-stat">
                <span>
                  <LockKeyhole size={11} />
                  A期配当 / 単位
                </span>
                <strong>{fmt(room.me?.dividends?.a)}</strong>
              </div>
              <div className="private-stat">
                <span>
                  <LockKeyhole size={11} />
                  B期配当 / 単位
                </span>
                <strong>{fmt(room.me?.dividends?.b)}</strong>
              </div>
            </div>
          )}
          <div className="tabs room-tabs" role="tablist" aria-label="表示内容">
            <button
              role="tab"
              aria-selected={tab === "market"}
              onClick={() => setTab("market")}
            >
              市場
            </button>
            <button
              role="tab"
              aria-selected={tab === "results"}
              onClick={() => setTab("results")}
            >
              {teacher ? "結果" : "自分の記録"}
            </button>
            {teacher && (
              <button
                role="tab"
                aria-selected={tab === "people"}
                onClick={() => setTab("people")}
              >
                参加者
              </button>
            )}
          </div>
          {tab === "market" && (
            <div className="market-grid">
              <aside>
                <OrderPanel room={room} act={act} disabled={disabled} />
              </aside>
              <HistoryPanel room={room} />
            </div>
          )}
          {tab === "results" && <ResultsPanel room={room} />}
          {tab === "people" && teacher && <ParticipantsPanel room={room} />}
          {room.status === "completed" && tab === "market" && (
            <ResultsPanel room={room} />
          )}
          <ExportPanel room={room} demo={demo} />
        </>
      )}
      {teacher && room.status === "lobby" && room.participantCount > 0 && (
        <ParticipantsPanel room={room} />
      )}
      {confirmation && (
        <dialog
          ref={dialogRef}
          className="confirmation-dialog"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-description"
          onCancel={() => setConfirmation(null)}
        >
          <h2 id="confirm-title">
            {confirmation.kind === "end-period" ? "この期を終了" : "解説を公開"}
          </h2>
          <p id="confirm-description">
            {confirmation.kind === "end-period"
              ? `第${confirmation.year}ラウンド ${confirmation.period}期を終了し、現在の保有量で配当を確定します。`
              : "全参加者に、全タイプの配当条件と理論価格を公開します。"}
          </p>
          <div>
            <button
              className="button secondary"
              onClick={() => setConfirmation(null)}
            >
              戻る
            </button>
            <button
              className="button primary"
              disabled={disabled}
              onClick={() => {
                const chosen = confirmation;
                setConfirmation(null);
                void act({ kind: chosen.kind, expectedPhase: chosen.phase });
              }}
            >
              {confirmation.kind === "end-period"
                ? "配当を確定して進む"
                : "全員に公開する"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
