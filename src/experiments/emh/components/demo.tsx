"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RotateCcw, Play, Pause } from "lucide-react";
import {
  act,
  assignParticipants,
  advanceClock,
  phaseKey,
  unitKey,
  view,
} from "../engine";
import type { Action, Actor, Room } from "../types";
import { demoTraderValue, makeDemo } from "../demo-model";
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type EmhSettings,
} from "../settings";
import { Shell } from "./shell";
import { RoomDashboard } from "./room-dashboard";
import { EmhCreateForm } from "./create-form";
import { SettingsFields } from "./settings-fields";
import { SettingsSummary } from "./settings-summary";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Header } from "@/components/shell";

function bot(room: Room, now: number) {
  if (room.status !== "trading" || room.pausedAt !== null) return;
  const p =
    room.participants[
      1 + Math.floor(Math.random() * (room.participants.length - 1))
    ]!;
  const value = Math.round(demoTraderValue(room, p));
  const actor: Actor = { role: "student", participantId: p.id };
  const key = unitKey(room);
  try {
    if (room.ask && room.ask.participantId !== p.id && room.ask.price <= value)
      act(
        room,
        actor,
        { kind: "accept", side: "ask", quoteId: room.ask.id, unitKey: key },
        now,
      );
    else if (
      p.holdings &&
      room.bid &&
      room.bid.participantId !== p.id &&
      room.bid.price >= value * 0.88
    )
      act(
        room,
        actor,
        { kind: "accept", side: "bid", quoteId: room.bid.id, unitKey: key },
        now,
      );
    else {
      const side = p.holdings && Math.random() > 0.5 ? "ask" : "bid";
      const price =
        side === "bid"
          ? Math.min(
              value,
              (room.bid?.price ?? Math.floor(value * 0.82)) +
                Math.ceil(Math.random() * 8),
            )
          : Math.max(
              Math.floor(value * 0.88),
              (room.ask?.price ?? Math.ceil(value * 1.05)) -
                Math.ceil(Math.random() * 8),
            );
      act(room, actor, { kind: "quote", side, price, unitKey: key }, now);
    }
  } catch {
    /* A changing quote or one's own best quote can legitimately reject a bot action. */
  }
}
type Setup = {
  title: string;
  settings: EmhSettings;
  experiment: "exp1" | "exp2";
};

function TeacherPageLink() {
  return (
    <Link
      className="button secondary small-button"
      href="/teacher?experiment=emh"
    >
      教員用ページへ
    </Link>
  );
}

export function Demo() {
  const [setup, setSetup] = useState<Setup>({
    title: "資産市場実験 · デモ",
    settings: structuredClone(DEFAULT_SETTINGS),
    experiment: "exp1",
  });
  const [running, setRunning] = useState(false);
  if (running)
    return (
      <DemoRoom
        initial={setup}
        onConfigure={(next) => {
          setSetup(next);
          setRunning(false);
        }}
      />
    );
  return (
    <>
      <Header homeHref="/emh/demo" leading={<TeacherPageLink />}>
        <span className="demo-header-tag">ひとりデモ</span>
        <Link
          className="button secondary small-button"
          href="/emh/demo/preview"
          target="_blank"
          rel="noopener noreferrer"
        >
          画面サイズ別プレビュー
        </Link>
      </Header>
      <main className="narrow-main teacher-setup-main">
        <div className="teacher-hub-main teacher-entry-content">
          <EmhCreateForm
            status={{ mode: "local", ready: true, keyRequired: false }}
            initialTitle={setup.title}
            initialSettings={setup.settings}
            initialExperiment={setup.experiment}
            onCreateDemo={(title, settings, experiment) => {
              setSetup({ title, settings, experiment });
              setRunning(true);
            }}
          />
        </div>
      </main>
    </>
  );
}

function DemoRoom({
  initial,
  onConfigure,
}: {
  initial: Setup;
  onConfigure: (setup: Setup) => void;
}) {
  const [room, setRoom] = useState(() =>
    makeDemo(initial.title, initial.settings, Date.now(), initial.experiment),
  );
  const current = useRef(room);
  const [settings, setSettings] = useState(initial.settings);
  const [draft, setDraft] = useState<EmhSettings | null>(null);
  const [assigned, setAssigned] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [role, setRole] = useState<Actor["role"]>("teacher");
  const [error, setError] = useState("");
  const [now, setNow] = useState(room.createdAt);
  const hiddenAt = useRef<number | null>(null);
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(settings);
  const locked = assigned || room.status !== "lobby";
  function replace(next: Room, at = Date.now()) {
    current.current = next;
    setRoom(next);
    setNow(at);
    setError("");
  }
  useEffect(() => {
    let lastBot = Date.now();
    const timer = setInterval(() => {
      const stored = current.current;
      if (stored.status === "lobby" || stored.status === "completed") return;
      const at = Date.now();
      if (document.hidden) {
        hiddenAt.current ??= at;
        return;
      }
      const next = structuredClone(stored);
      if (hiddenAt.current !== null) {
        const delta = at - hiddenAt.current;
        if (next.pausedAt === null) {
          if (next.periodEndsAt !== null) next.periodEndsAt += delta;
          if (next.unitEndsAt !== null) next.unitEndsAt += delta;
          if (next.breakEndsAt !== null) next.breakEndsAt += delta;
        }
        hiddenAt.current = null;
      }
      advanceClock(next, at);
      if (at - lastBot >= 1800) {
        bot(next, at);
        lastBot = at;
      }
      current.current = next;
      setRoom(next);
      setNow(at);
    }, 500);
    return () => clearInterval(timer);
  }, []);
  async function run(action: Action, as?: Actor) {
    const next = structuredClone(current.current);
    const at = Date.now();
    try {
      if (action.kind === "start" && !assigned)
        throw new Error("分け方を確定してください。");
      act(
        next,
        as ??
          (role === "teacher"
            ? { role: "teacher" }
            : { role: "student", participantId: "demo-0" }),
        action,
        at,
      );
      replace(next, at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作できませんでした。");
    }
  }
  return (
    <Shell wide room leading={<TeacherPageLink />}>
      <div
        className={
          initial.experiment === "exp2" && room.status !== "lobby"
            ? "emh-demo-exp2-active"
            : ""
        }
      >
        <div className="demo-toolbar">
          <span className="demo-tag">
            {initial.experiment === "exp2" ? "デモ · 練習用" : "デモ"}
          </span>
          <div className="segmented">
            <button
              aria-pressed={role === "teacher"}
              onClick={() => setRole("teacher")}
            >
              教員画面
            </button>
            <button
              aria-pressed={role === "student"}
              onClick={() => setRole("student")}
            >
              学生画面
            </button>
          </div>
          <div className="demo-controls">
            {initial.experiment === "exp2" &&
              room.status !== "lobby" &&
              role === "teacher" && (
                <button
                  className="button small secondary"
                  aria-expanded={conditionsOpen}
                  aria-controls="demo-conditions"
                  onClick={() => setConditionsOpen((open) => !open)}
                >
                  実験条件
                </button>
              )}
            {(room.status === "trading" || room.status === "break") && (
              <button
                className="button small secondary"
                onClick={() =>
                  run(
                    {
                      kind: room.pausedAt === null ? "pause" : "resume",
                      expectedPhase: phaseKey(room),
                    },
                    { role: "teacher" },
                  )
                }
              >
                {room.pausedAt === null ? (
                  <Pause size={14} />
                ) : (
                  <Play size={14} />
                )}
                {room.pausedAt === null ? "停止" : "再開"}
              </button>
            )}
            <button
              className="button small secondary"
              onClick={() =>
                onConfigure({
                  title: room.config.title,
                  settings,
                  experiment: initial.experiment,
                })
              }
            >
              <RotateCcw size={14} />
              設定を見直す
            </button>
          </div>
        </div>
        {(room.status === "lobby" || initial.experiment !== "exp2") && (
          <p className="demo-note">
            仮想参加者{room.participants.length - 1}
            人と操作を試せます。配当
            {initial.experiment === "exp2" ? "・実現する状態" : ""}
            はデモ用です。再読み込みすると設定画面に戻ります。
          </p>
        )}
        {error && (
          <p className="notice warning" role="alert">
            {error}
          </p>
        )}
        {role === "teacher" &&
          (room.status === "lobby" ||
            initial.experiment !== "exp2" ||
            conditionsOpen) && (
            <section
              id="demo-conditions"
              className="panel emh-session-settings"
            >
              {locked || initial.experiment === "exp2" ? (
                <SettingsSummary
                  settings={settings}
                  experiment={initial.experiment}
                />
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!draft || locked) return;
                    const parsed = settingsSchema.safeParse(draft);
                    if (!parsed.success) {
                      setError("人数・比率・証券数・時間を確認してください。");
                      return;
                    }
                    setSettings(parsed.data);
                    setDraft(null);
                    replace(
                      makeDemo(room.config.title, parsed.data, Date.now()),
                    );
                  }}
                >
                  <SettingsFields
                    settings={draft ?? settings}
                    onChange={setDraft}
                  />
                  <button className="button secondary" disabled={!dirty}>
                    設定を保存
                  </button>
                  {draft && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setDraft(null)}
                    >
                      変更を取り消す
                    </button>
                  )}
                  {dirty && (
                    <p className="field-help">
                      設定を保存すると、下の分け方に反映されます。
                    </p>
                  )}
                </form>
              )}
            </section>
          )}
        {room.status === "lobby" ? (
          <>
            <div className="room-heading">
              <h1>{room.config.title}</h1>
              <span className="status">
                {assigned ? "開始待ち" : "参加者を受付中"}
              </span>
            </div>
            <section className="panel emh-waiting">
              <h2>{room.participants.length}人が入室</h2>
              {role === "teacher" ? (
                <div className="emh-actions">
                  {assigned ? (
                    <>
                      <button
                        className="button secondary"
                        onClick={() => setReopen(true)}
                      >
                        割り当てを解除
                      </button>
                      <button
                        className="button primary"
                        onClick={() =>
                          run({ kind: "start", expectedPhase: phaseKey(room) })
                        }
                      >
                        全市場で実験を開始
                      </button>
                    </>
                  ) : (
                    <button
                      className="button primary"
                      disabled={dirty}
                      onClick={() => {
                        if (dirty) return;
                        const next = structuredClone(current.current);
                        assignParticipants(next);
                        replace(next);
                        setAssigned(true);
                      }}
                    >
                      分け方を確定して受付終了
                    </button>
                  )}
                </div>
              ) : (
                <p>教員が実験を開始するまで、この画面でお待ちください。</p>
              )}
            </section>
            {role === "teacher" && (
              <section className="panel emh-allocation">
                <h2>{assigned ? "市場の割り当て" : "現在の人数での分け方"}</h2>
                <div className="emh-allocation-grid">
                  <article>
                    <h3>
                      市場 1 <span>{room.participants.length}人</span>
                    </h3>
                    <p>タイプ別人数 {room.typeCounts!.join(" / ")}</p>
                    <p>
                      総証券数{" "}
                      {room.participants.length * settings.initialUnits}
                      単位
                    </p>
                  </article>
                </div>
              </section>
            )}
          </>
        ) : (
          <RoomDashboard
            room={view(
              room,
              role === "teacher"
                ? { role: "teacher" }
                : { role: "student", participantId: "demo-0" },
              now,
            )}
            act={run}
            demo
          />
        )}
        {reopen && (
          <ConfirmDialog
            title="割り当てを解除"
            message={
              initial.experiment === "exp2"
                ? "市場とタイプの割り当てを解除します。再確定すると参加者を割り当て直します。"
                : "市場とタイプの割り当てを解除し、受付と条件の編集を再開します。再確定すると参加者を割り当て直します。"
            }
            confirmLabel="解除して受付再開"
            onCancel={() => setReopen(false)}
            onConfirm={async () => {
              if (current.current.status !== "lobby") return;
              replace(
                makeDemo(
                  room.config.title,
                  settings,
                  Date.now(),
                  initial.experiment,
                ),
              );
              setAssigned(false);
              setDraft(null);
              setReopen(false);
            }}
          />
        )}
      </div>
    </Shell>
  );
}
