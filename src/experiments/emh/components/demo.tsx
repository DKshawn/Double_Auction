"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RotateCcw, Play, Pause } from "lucide-react";
import {
  act,
  addParticipant,
  advanceClock,
  newRoom,
  phaseKey,
  unitKey,
  view,
} from "@/experiments/emh/engine";
import type { Action, Actor, Room } from "@/experiments/emh/types";
import { Shell } from "./shell";
import { RoomDashboard } from "./room-dashboard";

function makeDemo() {
  const now = Date.now();
  const room = newRoom(
    "DEMO23",
    {
      title: "資産市場実験 · デモ",
      rounds: 2,
      periodSeconds: 120,
      unitSeconds: 30,
      breakSeconds: 10,
      dividends: [
        { a: 120, b: 40 },
        { a: 100, b: 60 },
        { a: 150, b: 30 },
      ],
    },
    now,
  );
  for (let i = 0; i < 9; i++)
    addParticipant(
      room,
      {
        id: `demo-${i}`,
        name: i === 0 ? "あなた" : `参加者 ${i + 1}`,
        studentId: `demo${i + 1}`,
        pinHash: "",
        tokenHash: "",
      },
      now,
    );
  return room;
}
function bot(room: Room, now: number) {
  if (room.status !== "trading" || room.pausedAt !== null) return;
  const p = room.participants[1 + Math.floor(Math.random() * 8)]!;
  const d = room.config.dividends[p.type! - 1]!;
  const value = room.period === "A" ? d.a + d.b : d.b;
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
export function Demo() {
  const [room, setRoom] = useState<Room | null>(null);
  const current = useRef<Room | null>(null);
  const [role, setRole] = useState<Actor["role"]>("teacher");
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const hiddenAt = useRef<number | null>(null);
  function reset() {
    const next = makeDemo();
    current.current = next;
    setRoom(next);
    setRole("teacher");
    setError("");
    setNow(Date.now());
  }
  useEffect(() => {
    let lastBot = Date.now();
    const timer = setInterval(() => {
      const stored = current.current ?? makeDemo();
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
    if (!current.current) return;
    const next = structuredClone(current.current);
    const at = Date.now();
    try {
      act(
        next,
        as ??
          (role === "teacher"
            ? { role: "teacher" }
            : { role: "student", participantId: "demo-0" }),
        action,
        at,
      );
      current.current = next;
      setRoom(next);
      setNow(at);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作できませんでした。");
    }
  }
  return (
    <Shell wide room>
      <Link
        className="button secondary small-button"
        href="/teacher?experiment=emh"
      >
        教員用ページへ
      </Link>
      <div className="demo-toolbar">
        <span className="demo-tag">デモ</span>
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
          {room && (room.status === "trading" || room.status === "break") && (
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
              )}{" "}
              {room.pausedAt === null ? "停止" : "再開"}
            </button>
          )}
          <button className="button small quiet" onClick={reset}>
            <RotateCcw size={14} />
            やり直す
          </button>
        </div>
      </div>
      <p className="demo-note">
        仮想参加者8人と操作を試せます。配当と時間はデモ用です。記録は保存しません。
      </p>
      {error && (
        <p className="notice warning" role="alert">
          {error}
        </p>
      )}
      {room && (
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
    </Shell>
  );
}
