"use client";

import {
  DoorOpen,
  Shuffle,
  UsersRound,
  Check,
  Clock3,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Command, RoomView } from "@/lib/types";
import { studyMarketSize } from "@/lib/study-config";
import { INSTITUTIONS } from "@/lib/study-rules";
import { Header } from "./shell";

export function StudyRoster({
  view,
  command,
  disabled,
}: {
  view: RoomView;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
}) {
  const study = view.study!,
    teacher = study.teacher!,
    lobby = study.lobby!;
  const waiting = view.phase === "waiting";
  const assigned = lobby.randomizedAt !== null;
  const full = view.participantCount === view.config.capacity;
  const size = studyMarketSize(view.config);
  return (
    <details
      key={waiting ? "admission" : "experiment"}
      className="panel study-roster"
      open={waiting}
    >
      <summary>
        <div>
          <UsersRound size={22} />
          <h2>
            学生の割り当て{" "}
            <small>
              {view.participantCount} / {view.config.capacity}人
            </small>
          </h2>
        </div>
        <span className={`study-lobby-label ${assigned ? "assigned" : ""}`}>
          {assigned ? "割り当て済み" : "入室順の仮配置"}
        </span>
      </summary>
      <div className="study-roster-content">
        <div className="study-roster-actions">
          <p>
            {waiting
              ? assigned
                ? "市場と買い手・売り手の割り当てが完了しました。「実験を開始」で全市場の5秒カウントダウンが始まります。"
                : "買い手・売り手の枠は固定です。入室順に仮配置し、全員がそろったら学生をランダムに割り当ててください。"
              : "実験開始時の割り当てです。各市場の買い手・売り手は実験終了まで固定されます。"}
          </p>
          {waiting && (
            <button
              className="button secondary"
              disabled={disabled || !full}
              onClick={() =>
                void command({
                  type: "study-randomize",
                  expectedRevision: lobby.revision,
                })
              }
            >
              <Shuffle size={17} />
              {assigned ? "もう一度ランダムに割り当て" : "ランダムに割り当て"}
            </button>
          )}
        </div>
        {waiting && !full && (
          <p className="field-help">
            あと{view.config.capacity - view.participantCount}
            人の入室を待っています。
          </p>
        )}
        <div className="study-roster-grid">
          {teacher.markets.map((market) => {
            const people = teacher.participants.filter(
              (p) => p.market === market.id,
            );
            const byAlias = new Map(people.map((p) => [p.alias, p]));
            const slots = Array.from({ length: size / 2 }, (_, index) =>
              (["buyer", "seller"] as const).map((role) => ({
                role,
                alias: `${role === "buyer" ? "買" : "売"}${String(index + 1).padStart(2, "0")}`,
              })),
            ).flat();
            return (
              <section
                className={`study-roster-room ${people.length === size ? "full" : ""}`}
                key={market.id}
                aria-label={`市場${market.id}の学生`}
              >
                <header>
                  <div>
                    <DoorOpen size={20} />
                    <h3>市場 {market.id}</h3>
                  </div>
                  <span>
                    {people.length} / {size}人
                  </span>
                </header>
                <p className="study-roster-sequence">
                  {market.order.map((i) => INSTITUTIONS[i].short).join(" → ")}
                </p>
                <ul>
                  {slots.map(({ role, alias }) => {
                    const person = byAlias.get(alias);
                    return (
                      <li
                        key={alias}
                        className={person ? undefined : "study-roster-empty"}
                      >
                        <span className={`role-tag ${role}`}>{alias}</span>
                        {person ? (
                          <>
                            <b>{person.nickname}</b>
                            <span
                              className="study-roster-number"
                              title="入室順"
                            >
                              {person.joinOrder}
                            </span>
                          </>
                        ) : (
                          <span>入室待ち</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <footer>
                  {assigned ? (
                    <>
                      <Check size={14} />
                      買い手{people.filter((p) => p.role === "buyer").length}
                      人・売り手
                      {people.filter((p) => p.role === "seller").length}人
                    </>
                  ) : (
                    "役割はランダム割り当て後に確定"
                  )}
                </footer>
              </section>
            );
          })}
        </div>
      </div>
    </details>
  );
}

export function StudyWaitingRoom({
  view,
  connected,
  retry,
  toolbar,
  demo,
  error,
}: {
  view: RoomView;
  connected: boolean;
  retry: () => void;
  toolbar?: ReactNode;
  demo: boolean;
  error: string;
}) {
  const assigned = view.study!.lobby!.randomizedAt !== null;
  return (
    <div className="study-shell study-waiting-shell">
      <Header>
        {demo ? (
          <span className="demo-header-tag">ひとりデモ</span>
        ) : (
          <span className={`connection ${connected ? "" : "disconnected"}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connected ? "接続中" : "再接続中"}
          </span>
        )}
        <span className="header-room-code">
          ルーム <b>{view.code}</b>
        </span>
      </Header>
      <main className="study-main">
        {toolbar}
        <section
          className="panel study-waiting-card"
          aria-label="学生の待機画面"
        >
          <div className="study-waiting-icon">
            {assigned ? <Check size={32} /> : <Clock3 size={32} />}
          </div>
          <p className="eyebrow study-waiting-admission">入室が完了しました</p>
          {assigned && <h1>割り当てが完了しました</h1>}
          <p className="study-waiting-message">
            {view.me.nickname} さん、この画面を開いたままお待ちください。
          </p>
          <p>
            {assigned
              ? "教員が開始すると実験画面に切り替わり、5秒後に取引が始まります。"
              : "全員の入室後、教員が市場と買い手・売り手をランダムに割り当てます。"}
          </p>
          <ol className="study-waiting-steps">
            <li className="complete">
              <Check size={16} />
              入室
            </li>
          </ol>
          <div className="study-waiting-count">
            入室済み <b>{view.participantCount}</b> / {view.config.capacity}人
          </div>
          {!connected && (
            <p className="error-message" role="status">
              接続が切れています。
              <button className="text-button" onClick={retry}>
                再接続
              </button>
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
