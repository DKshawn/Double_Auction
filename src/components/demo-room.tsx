"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  UserRound,
  GraduationCap,
} from "lucide-react";
import { DemoSession, DEMO_CAPACITY, DEMO_MARKETS } from "@/lib/demo";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { Institution } from "@/lib/study-types";
import type { Role } from "@/lib/types";
import { StudyRoom } from "./study-room";
import { StudyDetailDialog } from "./study-detail-dialog";
import { studyTiming } from "@/lib/study-timing";

export default function DemoRoom() {
  const [session] = useState(
    () => new DemoSession("cda", "buyer", Date.now(), { lobby: true }),
  );
  // DemoEntry mounts only in the browser. The preview supplies a same-origin
  // toolbar host before loading this iframe; ordinary /demo keeps its toolbar.
  const [controlsTarget] = useState<HTMLElement | null>(() => {
    if (typeof window === "undefined") return null;
    const id = window.frameElement?.getAttribute("data-demo-controls");
    return id ? window.parent.document.getElementById(id) : null;
  });
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const { view, now, teacher, role, institution } = state;
  const market = view.study!.market;
  const needsAssignment =
    view.phase === "waiting" && view.study!.lobby?.randomizedAt === null;
  useEffect(() => {
    const timer = window.setInterval(() => {
      // A presentation can sit in a background tab without losing the user's turn.
      if (!document.hidden) session.tick(250);
    }, 250);
    return () => window.clearInterval(timer);
  }, [session]);
  const control =
    view.phase === "paused"
      ? "resume"
      : view.phase === "running"
        ? "pause"
        : "start";
  const controlLabel =
    view.phase === "paused"
      ? "再開"
      : view.phase === "running"
        ? "一時停止"
        : "実験を開始";
  const skipLabel = teacher
    ? "30秒進める"
    : market.stage === "done"
      ? "30秒進める"
      : market.stage === "offer"
        ? "提示を締め切って公開"
        : market.stage === "call"
          ? "今の注文を清算"
          : market.stage === "purchase"
            ? "今の購入時間を終了"
            : "今期を終了";
  const toolbar = (
    <section className="demo-panel" aria-label="ひとりデモの操作">
      <div className="demo-controls">
        <div className="demo-options">
          <label className="field">
            開始制度（リセット）
            <select
              value={institution}
              onChange={(e) =>
                session.reset(e.target.value as Institution, role)
              }
            >
              {Object.entries(INSTITUTIONS).map(([id, info]) => (
                <option key={id} value={id}>
                  {info.short} · {info.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {teacher ? "表示対象" : "あなたの役割"}
            <select
              value={teacher ? "all" : role}
              disabled={teacher || view.phase !== "waiting" || !needsAssignment}
              onChange={(e) =>
                session.reset(institution, e.target.value as Role)
              }
            >
              {teacher ? (
                <option value="all">買い手・売り手の両方</option>
              ) : (
                <>
                  <option value="buyer">買い手</option>
                  <option value="seller">売り手</option>
                </>
              )}
            </select>
          </label>
          <button className="button secondary" onClick={session.toggleTeacher}>
            {teacher ? <UserRound size={16} /> : <GraduationCap size={16} />}
            {teacher ? "学生画面に戻る" : "教員画面を見る"}
          </button>
        </div>
        <div className="demo-actions">
          <button
            className="button primary"
            disabled={view.phase === "finished" || needsAssignment}
            onClick={() => session.command({ type: control }, true)}
          >
            {control === "pause" ? <Pause size={16} /> : <Play size={16} />}
            {controlLabel}
          </button>
          <button
            className="button secondary"
            disabled={view.phase !== "running" || market.stage === "countdown"}
            onClick={
              teacher || market.stage === "done"
                ? () => session.advanceTime()
                : session.skipStage
            }
          >
            <SkipForward size={16} />
            {skipLabel}
          </button>
          {!teacher &&
            role === "buyer" &&
            market.institution === "posted" &&
            ["offer", "purchase"].includes(market.stage) && (
              <button
                className="button secondary"
                disabled={
                  view.phase !== "running" ||
                  market.activeBuyer === view.me.alias
                }
                onClick={session.skipToHuman}
              >
                自分の購入順へ進む
              </button>
            )}
          <button className="text-button" onClick={() => session.reset()}>
            <RotateCcw size={14} /> やり直す
          </button>
        </div>
      </div>
      <div className="demo-caption">
        <span className="demo-count">
          {DEMO_MARKETS}市場・あなた1人 ＋ 仮想参加者{DEMO_CAPACITY - 1}人
        </span>
        <p className="demo-hint">
          {needsAssignment
            ? "教員画面で「ランダムに割り当て」を押してから、実験を開始してください。"
            : market.stage === "countdown"
              ? "全市場の開始まで5秒間カウントダウンします。"
              : teacher
                ? "各市場は独立して次の期へ進みます。一時停止・再開は全市場に適用されます。"
                : view.phase === "waiting"
                  ? "割り当てが完了しました。「実験を開始」で5秒後に取引が始まります。"
                  : view.phase === "paused"
                    ? "時計と仮想参加者を停止中です。説明が終わったら「再開」を押してください。"
                    : market.stage === "done"
                      ? "市場1の実験は終了しました。教員画面で全市場の進行状況と結果を確認できます。"
                      : market.stage === "cda"
                        ? "注文板の最良価格で取引するか、自分の希望価格を入力してください。各期2単位まで取引できます。"
                        : market.stage === "call"
                          ? "希望価格を送信し、「今の注文を清算」を押すと待たずに結果を確認できます。"
                          : market.stage === "offer"
                            ? role === "seller"
                              ? "販売価格と数量を送信し、「提示を締め切って公開」を押してください。"
                              : "「自分の購入順へ進む」を押すと、売り手の価格を見て購入できます。"
                            : role === "seller"
                              ? "仮想の買い手が順番に購入します。説明中は「一時停止」で時計を止められます。"
                              : `自分の順番では${studyTiming(view.config).buyerSeconds}秒以内に購入してください。説明中は「一時停止」で時計を止められます。`}
        </p>
        <StudyDetailDialog label="デモについて">
          <p>
            12市場・192人の実験を体験できます。あなた1人と仮想参加者191人が入室済みです。教員画面で市場と役割をランダムに割り当て、開始すると5秒後に取引が始まります。あなた以外の参加者は自動で取引します。
          </p>
          <p className="demo-note">
            各市場は買い手8人・売り手8人です。3制度の6通りの順序を各2市場に割り当てます。各市場は終了した期から自動で次の期へ進み、15期で終了します。「30秒進める」で全市場の時間を進められます。教員画面でも、あなたの注文や購入は自動では行いません。取引するときは学生画面に戻ってください。
          </p>
          <p className="demo-note">
            デモ用の条件を使用します。制度・役割の変更と再読み込みでリセットされ、実験データには保存されません。仮想取引の結果は学生の収束を示すものではありません。
          </p>
          <p className="demo-note">
            <Link
              href="/demo/preview"
              target="_blank"
              rel="noopener noreferrer"
            >
              ノートPCの画面サイズでデモを試す ↗
            </Link>
          </p>
        </StudyDetailDialog>
      </div>
    </section>
  );
  return (
    <>
      {controlsTarget && createPortal(toolbar, controlsTarget)}
      <StudyRoom
        key={`${state.generation}-${teacher}`}
        view={view}
        now={now}
        command={session.command}
        disabled={false}
        connected
        error={state.error}
        notice=""
        retry={() => {}}
        demo
        toolbar={controlsTarget ? undefined : toolbar}
      />
    </>
  );
}
