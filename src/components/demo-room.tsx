"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  UserRound,
  GraduationCap,
} from "lucide-react";
import { DemoSession } from "@/lib/demo";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { Institution } from "@/lib/study-types";
import type { Role } from "@/lib/types";
import { StudyRoom } from "./study-room";

export default function DemoRoom() {
  const [session] = useState(() => new DemoSession());
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const { view, now, teacher, role, institution } = state;
  const market = view.study!.market;
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
        : view.phase === "review"
          ? "次の期を始める"
          : "デモを開始";
  const skipLabel =
    market.stage === "offer"
      ? "提示を締め切って公開"
      : market.stage === "call"
        ? "今の注文を清算"
        : market.stage === "purchase"
          ? "今の購入時間を終了"
          : "今期を終了";
  const toolbar = (
    <section className="demo-panel" aria-label="ひとりデモの操作">
      <div className="demo-intro">
        <div>
          <span className="eyebrow">操作体験 · デモ専用</span>
          <h2>ひとりで、市場を動かしてみよう。</h2>
        </div>
        <span className="demo-count">あなた1人 ＋ 仮想参加者15人</span>
      </div>
      <p>
        買い手・売り手のどちらも体験できます。仮想参加者は自動で注文し、教員画面では価格と利益を確認できます。
      </p>
      <div className="demo-options">
        <label className="field">
          最初に試す制度
          <select
            value={institution}
            onChange={(e) => session.reset(e.target.value as Institution, role)}
          >
            {Object.entries(INSTITUTIONS).map(([id, info]) => (
              <option key={id} value={id}>
                {info.short} · {info.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          あなたの役割
          <select
            value={role}
            onChange={(e) => session.reset(institution, e.target.value as Role)}
          >
            <option value="buyer">買い手</option>
            <option value="seller">売り手</option>
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
          disabled={view.phase === "finished"}
          onClick={() => session.command({ type: control }, true)}
        >
          {control === "pause" ? <Pause size={16} /> : <Play size={16} />}
          {controlLabel}
        </button>
        <button
          className="button secondary"
          disabled={view.phase !== "running"}
          onClick={session.skipStage}
        >
          <SkipForward size={16} />
          {skipLabel}
        </button>
        {role === "buyer" &&
          market.institution === "posted" &&
          ["offer", "purchase"].includes(market.stage) && (
            <button
              className="button secondary"
              disabled={
                view.phase !== "running" || market.activeBuyer === "買01"
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
      <p className="demo-hint">
        {view.phase === "waiting"
          ? "「デモを開始」を押すと、下の取引画面で操作できます。"
          : view.phase === "paused"
            ? "時計と仮想参加者を停止中です。説明が終わったら「再開」を押してください。"
            : view.phase === "review"
              ? "今期が終了しました。教員画面で結果を見るか、次の期を始めてください。"
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
                      : "自分の順番では10秒以内に購入してください。説明中は「一時停止」で時計を止められます。"}
      </p>
      <p className="demo-note">
        デモ用の条件を使用します。制度・役割の変更と再読み込みでリセットされ、実験データには保存されません。仮想取引の結果は学生の収束を示すものではありません。
      </p>
    </section>
  );
  return (
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
      toolbar={toolbar}
    />
  );
}
