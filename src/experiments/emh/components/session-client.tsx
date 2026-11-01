"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/shell";
import type {
  SessionCommand,
  SessionView,
  RequestCommand,
} from "../session-types";
import type { Action } from "../types";
import { RoomDashboard } from "./room-dashboard";

export function SessionClient({
  code,
  role,
}: {
  code: string;
  role: "teacher" | "student";
}) {
  const [state, setState] = useState<SessionView | null>(null);
  const latest = useRef<SessionView | null>(null);
  const [selected, setSelected] = useState<number>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [retry, setRetry] = useState<RequestCommand | null>(null);
  const [reveal, setReveal] = useState<SessionCommand | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const url = `/api/rooms/${code}/emh?session=${role}${selected ? `&market=${selected}` : ""}`;
  const accept = useCallback((next: SessionView) => {
    const previous = latest.current;
    if (
      previous &&
      (previous.serverNow > next.serverNow ||
        previous.revision > next.revision ||
        (previous.revision === next.revision &&
          previous.marketId === next.marketId &&
          previous.market &&
          next.market &&
          previous.market.revision > next.market.revision))
    )
      return;
    latest.current = next;
    setState(next);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setUnauthorized(response.status === 401);
          throw new Error(result.error ?? "接続できませんでした。");
        }
        accept(result.state);
        setOnline(true);
        setUnauthorized(false);
      } catch (e) {
        if (controller.signal.aborted) return;
        setOnline(false);
        setError(e instanceof Error ? e.message : "接続できませんでした。");
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(
            poll,
            role === "teacher"
              ? 2000
              : latest.current?.status === "completed"
                ? 6000
                : latest.current?.market?.status === "trading" &&
                    latest.current.market.pausedAt === null
                  ? 1200
                  : 2000,
          );
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, role, accept]);
  useEffect(() => {
    if (reveal) dialog.current?.showModal();
  }, [reveal]);
  async function send(input: RequestCommand) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setRetry(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (result.state) accept(result.state);
      if (!response.ok) {
        setError(result.error ?? "操作できませんでした。");
        if (response.status >= 500) setRetry(input);
        if (response.status === 401) setUnauthorized(true);
      } else setOnline(true);
    } catch {
      setOnline(false);
      setError("通信が途切れました。接続後に同じ操作を再送できます。");
      setRetry(input);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function command(kind: SessionCommand["kind"]) {
    if (!state) return;
    void send({
      scope: "session",
      requestId: crypto.randomUUID(),
      command: { kind, expectedRevision: state.revision },
    });
  }
  async function marketAction(action: Action) {
    if (!state?.marketId) return;
    await send({
      scope: "market",
      requestId: crypto.randomUUID(),
      marketId: state.marketId,
      action,
    });
  }
  const teacher = role === "teacher";
  const disabled =
    busy || !online || Boolean(selected && selected !== state?.marketId);
  return (
    <>
      <Header>
        {teacher && <Link href="/teacher">ルーム管理</Link>}
        <Link href="/emh/guide" target="_blank">
          EMH のルール
        </Link>
      </Header>
      <div className="emh-app">
        <main className="container wide emh-session">
          {error && (
            <div className="notice warning" role="alert">
              {error}{" "}
              {retry && (
                <button
                  className="button secondary small"
                  disabled={busy || !online}
                  onClick={() => void send(retry)}
                >
                  同じ操作を再送
                </button>
              )}
              <button
                aria-label="通知を閉じる"
                className="emh-dismiss"
                onClick={() => setError("")}
              >
                閉じる
              </button>
            </div>
          )}
          {unauthorized ? (
            <section className="panel emh-waiting">
              <h1>再入室してください</h1>
              <Link
                className="button primary"
                href={teacher ? `/teacher?code=${code}` : `/?code=${code}`}
              >
                再入室
              </Link>
            </section>
          ) : !state ? (
            <p role="status">ルームを読み込み中…</p>
          ) : (
            <>
              {state.market ? (
                <>
                  {teacher && (
                    <section className="emh-session-controls panel">
                      <div className="emh-session-top">
                        <h2>
                          {state.title} · 全 {state.markets.length} 市場
                        </h2>
                        <div className="emh-actions">
                          <button
                            className="button secondary small"
                            disabled={
                              disabled ||
                              !state.markets.some(
                                (m) => m.status !== "completed" && !m.paused,
                              )
                            }
                            onClick={() => command("pause-all")}
                          >
                            全市場を一時停止
                          </button>
                          <button
                            className="button secondary small"
                            disabled={
                              disabled || !state.markets.some((m) => m.paused)
                            }
                            onClick={() => command("resume-all")}
                          >
                            全市場を再開
                          </button>
                          <button
                            className="button secondary small"
                            disabled={
                              disabled ||
                              state.status !== "completed" ||
                              state.markets.every((m) => m.revealed)
                            }
                            onClick={() =>
                              setReveal({
                                kind: "reveal-all",
                                expectedRevision: state.revision,
                              })
                            }
                          >
                            {state.markets.every((m) => m.revealed)
                              ? "解説を公開済み"
                              : "全市場に解説を公開"}
                          </button>
                        </div>
                      </div>
                      <div
                        className="emh-market-selector"
                        aria-label="表示する市場"
                      >
                        {state.markets.map((m) => (
                          <button
                            key={m.id}
                            className={`emh-market-button ${state.marketId === m.id ? "selected" : ""}`}
                            aria-pressed={state.marketId === m.id}
                            disabled={busy}
                            onClick={() => setSelected(m.id)}
                          >
                            <b>
                              市場 {m.id} <span>{m.size}人</span>
                            </b>
                            <span>
                              {m.status === "completed"
                                ? "終了"
                                : `${m.year}R ${m.period}期${m.paused ? " · 停止中" : ""}`}{" "}
                              · {m.trades}件
                            </span>
                          </button>
                        ))}
                      </div>
                      <details className="emh-all-exports">
                        <summary>全市場のデータを保存</summary>
                        <div className="emh-actions">
                          {[
                            ["trades", "取引"],
                            ["results", "期別集計"],
                            ["payouts", "配当"],
                            ["participants", "参加者"],
                            ["audit", "操作履歴"],
                            ["conditions", "条件・割り当て"],
                          ].map(([kind, label]) => (
                            <a
                              key={kind}
                              href={`/api/rooms/${code}/emh/export?session=teacher&kind=${kind}`}
                              className="button secondary small"
                            >
                              {label}
                            </a>
                          ))}
                        </div>
                      </details>
                    </section>
                  )}
                  <RoomDashboard
                    key={state.marketId}
                    room={state.market}
                    showReveal={false}
                    act={marketAction}
                    busy={disabled}
                    online={online}
                  />
                </>
              ) : (
                <>
                  <div className="room-heading">
                    <div>
                      <div className="room-context">
                        EMH · ルーム <strong className="mono">{code}</strong>
                      </div>
                      <h1>{state.title}</h1>
                    </div>
                    <span className="status">
                      {state.status === "open" ? "参加者を受付中" : "開始待ち"}
                    </span>
                  </div>
                  <section className="panel emh-waiting">
                    <h2>{state.participantCount}人が入室</h2>
                    {teacher ? (
                      <>
                        <p>
                          {state.status === "open"
                            ? "全員が入室したら、受付を終了して市場を割り当ててください。"
                            : "市場の割り当てが完了しました。全員同時に開始します。"}
                        </p>
                        <div className="emh-actions">
                          <button
                            className="button secondary"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(
                                  `${window.location.origin}/?code=${code}`,
                                )
                                .then(() =>
                                  setError("参加リンクをコピーしました。"),
                                )
                                .catch(() =>
                                  setError(
                                    `ルームコード ${code} を共有してください。`,
                                  ),
                                )
                            }
                          >
                            参加リンクをコピー
                          </button>
                          {state.status === "open" ? (
                            <button
                              className="button primary"
                              disabled={disabled || state.participantCount < 3}
                              onClick={() => command("assign")}
                            >
                              受付を終了して自動分け
                            </button>
                          ) : (
                            <>
                              <button
                                className="button secondary"
                                disabled={disabled}
                                onClick={() => command("reopen")}
                              >
                                受付を再開
                              </button>
                              <button
                                className="button primary"
                                disabled={disabled}
                                onClick={() => command("start")}
                              >
                                全市場で実験を開始
                              </button>
                            </>
                          )}
                        </div>
                        {state.participantCount < 3 && (
                          <p className="muted">開始には3人以上必要です。</p>
                        )}
                      </>
                    ) : (
                      <p>
                        {state.status === "open"
                          ? "教員が受付を終了するまで、この画面でお待ちください。"
                          : `市場 ${state.marketId} に参加します。開始後に自分の配当を確認してください。`}
                      </p>
                    )}
                  </section>
                  {teacher && (
                    <section className="panel emh-allocation">
                      <h2>
                        {state.status === "open"
                          ? "現在の人数での分け方"
                          : "市場の割り当て"}
                      </h2>
                      <div className="emh-allocation-grid">
                        {state.allocation.map((m) => (
                          <article key={m.id}>
                            <h3>
                              市場 {m.id} <span>{m.size}人</span>
                            </h3>
                            <p>タイプ別人数 {m.typeCounts.join(" / ")}</p>
                            {state.status === "assigned" && (
                              <p>
                                {state.participants
                                  .filter((p) => p.marketId === m.id)
                                  .map((p) => p.name)
                                  .join("、")}
                              </p>
                            )}
                          </article>
                        ))}
                      </div>
                      {state.status === "open" &&
                        state.participants.length > 0 && (
                          <p className="emh-roster">
                            {state.participants.map((p) => p.name).join("、")}
                          </p>
                        )}
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {reveal && (
            <dialog
              ref={dialog}
              className="confirmation-dialog"
              onCancel={() => setReveal(null)}
              aria-labelledby="emh-reveal-title"
            >
              <h2 id="emh-reveal-title">全市場に解説を公開</h2>
              <p>全参加者に、全タイプの配当条件と理論価格を公開します。</p>
              <div className="emh-actions">
                <button
                  className="button secondary"
                  onClick={() => setReveal(null)}
                >
                  戻る
                </button>
                <button
                  className="button primary"
                  disabled={disabled}
                  onClick={() => {
                    setReveal(null);
                    void send({
                      scope: "session",
                      requestId: crypto.randomUUID(),
                      command: reveal,
                    });
                  }}
                >
                  全員に公開する
                </button>
              </div>
            </dialog>
          )}
        </main>
      </div>
    </>
  );
}
