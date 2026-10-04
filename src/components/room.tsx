"use client";

import Link from "next/link";
import {
  CircleHelp,
  Clock3,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Header, Footer, Spinner } from "./shell";
import { JoinForm } from "./join-form";
import { StudentMarket } from "./student-market";
import { TeacherDashboard } from "./teacher-dashboard";
import { useRoom } from "./use-room";
import { StudyRoom } from "./study-room";
import type { Phase } from "@/lib/types";

const labels: Record<Phase, string> = {
  waiting: "開始待ち",
  running: "取引中",
  paused: "一時停止中",
  review: "ラウンド終了",
  finished: "実験終了",
};

export function Room({ code }: { code: string }) {
  const {
    view,
    connected,
    connectionError,
    authError,
    error,
    notice,
    pending,
    now,
    command,
    retry,
  } = useRoom(code);
  if (authError)
    return (
      <>
        <Header />
        <main className="narrow-main">
          <p className="callout">{authError}</p>
          <div className="join-card">
            <JoinForm initialCode={code} />
          </div>
        </main>
        <Footer />
      </>
    );
  if (!view)
    return (
      <>
        <Header />
        <main className="loading-state">
          <Spinner />
          <h2>
            {connectionError
              ? "実験ルームに接続できません"
              : "実験ルームに接続しています"}
          </h2>
          {connectionError && <p role="alert">{connectionError}</p>}
          <p>ルームコード：{code}</p>
          <button className="button secondary" onClick={retry}>
            <RefreshCw size={15} />
            再接続
          </button>
          <Link href="/">ホームに戻る</Link>
        </main>
      </>
    );
  if (view.study)
    return (
      <StudyRoom
        view={view}
        now={now}
        command={command}
        disabled={pending || !connected}
        connected={connected}
        error={error}
        notice={notice ?? ""}
        retry={retry}
      />
    );
  const teacher = view.me.role === "teacher";
  const remaining =
    view.phase === "running"
      ? Math.max(0, (view.deadline ?? now) - now)
      : view.remainingMs;
  const seconds = Math.ceil(remaining / 1000);
  const time = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const marketDisabled =
    pending || !connected || view.phase !== "running" || remaining <= 0;
  return (
    <>
      <Header>
        <span className={`connection ${connected ? "" : "disconnected"}`}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? "接続中" : "再接続中"}
        </span>
        <span className="header-room-code">
          ルーム <b>{code}</b>
        </span>
        <span className={`role-tag ${teacher ? "teacher" : view.me.role}`}>
          {teacher ? <ShieldCheck size={13} /> : null}
          {teacher ? "教員" : view.me.role === "buyer" ? "買い手" : "売り手"}
        </span>
        <span className="avatar" title={view.me.nickname}>
          {teacher ? "教" : view.me.alias}
        </span>
      </Header>
      <main className="room-main">
        <div className="room-heading">
          <div>
            <div className="eyebrow">
              {teacher
                ? "教員用ダッシュボード"
                : `${view.me.nickname} さん · ${view.me.alias}`}
            </div>
            <h1>{teacher ? view.config.title : "取引ルーム"}</h1>
            <p>
              {teacher
                ? "3つの市場を観察し、ラウンドごとの変化を記録します。"
                : "商品を選んで、あなたの価格を提示しましょう。"}
            </p>
          </div>
          <div className="round-display">
            <div>
              <span className={`phase-label phase-${view.phase}`}>
                <i />
                {labels[view.phase]}
              </span>
              <strong>
                ラウンド <b>{view.round || "—"}</b>
                <small> / {view.config.rounds}</small>
              </strong>
            </div>
            <span className="vertical-line" />
            <div
              className={`timer ${seconds < 30 && view.phase === "running" ? "timer-warning" : ""}`}
            >
              <span>
                <Clock3 size={13} />
                残り時間
              </span>
              <b>{time}</b>
            </div>
          </div>
        </div>
        {view.mode === "local" && (
          <div className="local-banner">
            <FlaskConical size={14} />
            ローカル環境
            {teacher
              ? "・このコンピューターに実験データを保存しています"
              : "での実験"}
          </div>
        )}
        {!connected && (
          <div className="error-message connection-alert" role="status">
            <WifiOff size={16} />
            <span>
              通信が途切れています。注文の状態を確認するため、取引を停止して再接続しています。
            </span>
            <button className="text-button" onClick={retry}>
              再接続
            </button>
          </div>
        )}
        {!teacher && view.phase !== "running" && (
          <div
            className={`phase-banner ${view.phase === "finished" ? "finished-banner" : ""}`}
          >
            <span className="phase-banner-icon">
              {view.phase === "finished" ? "✓" : <Clock3 size={19} />}
            </span>
            <div>
              <b>
                {view.phase === "waiting"
                  ? "教員が実験を開始するまでお待ちください"
                  : view.phase === "paused"
                    ? "取引は一時停止中です"
                    : view.phase === "review"
                      ? "このラウンドは終了しました"
                      : "おつかれさまでした。実験は終了です"}
              </b>
              <p>
                {view.phase === "waiting"
                  ? `現在 ${view.participantCount} / ${view.config.capacity} 人が参加しています。開始前は教員が条件を変更する場合があります。開始時に自分の価値・費用を確認しましょう。`
                  : view.phase === "paused"
                    ? "注文はそのまま保管され、教員の操作で再開します。"
                    : view.phase === "review"
                      ? `今ラウンドの利益は ${view.me.roundProfit} 円です。次のラウンドの開始をお待ちください。`
                      : `あなたの累積利益は ${view.me.profit} 円です。取引履歴から結果を振り返りましょう。`}
              </p>
            </div>
          </div>
        )}
        <div className="feedback-area" aria-live="polite">
          {error ? (
            <p className="error-message">{error}</p>
          ) : notice ? (
            <p className="success-message">{notice}</p>
          ) : null}
        </div>
        {teacher ? (
          <TeacherDashboard
            view={view}
            command={command}
            disabled={pending || !connected}
          />
        ) : (
          <StudentMarket
            view={view}
            command={command}
            disabled={marketDisabled}
          />
        )}
        <div className="room-bottom-note">
          <span>注文・約定は自動で同期されます。</span>
          <Link href="/guide?legacy=1" target="_blank">
            <CircleHelp size={15} />
            実験のルール
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
