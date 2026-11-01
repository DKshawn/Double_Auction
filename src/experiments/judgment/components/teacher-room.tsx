"use client";
import { JUDGMENT_NAME } from "../constants";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/shell";
import { api, ApiError, errorMessage } from "@/lib/client";
import type { PreviewProtocol, Settings, Study, TeacherView } from "../types";
import type { Command } from "../server/validation";
import { SettingsFields } from "./settings-fields";
import { JudgmentPreview } from "./preview";
const statuses = { active: "回答中", completed: "完了", withdrawn: "終了" };
export function JudgmentTeacherRoom({
  code,
  studies,
}: {
  code: string;
  studies: Study[];
}) {
  const [data, setData] = useState<TeacherView | null>(null),
    [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [busy, setBusy] = useState(false),
    [needsLogin, setNeedsLogin] = useState(false);
  const [preview, setPreview] = useState<PreviewProtocol[] | null>(null),
    [ending, setEnding] = useState(false);
  const commandPending = useRef<Command | null>(null),
    busyRef = useRef(false);
  const base = `/api/rooms/${code}/judgment`;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const view = await api<TeacherView>(
          base + "?session=teacher",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted && !busyRef.current) {
          setData(view);
          setSettings((previous) => previous ?? view.settings);
          setConnectionError("");
          setNeedsLogin(false);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setConnectionError(errorMessage(e));
          if (e instanceof ApiError && e.status === 401) setNeedsLogin(true);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [base]);
  async function command(kind: "start" | "end") {
    if (!data || !settings) return;
    const payload =
      (commandPending.current?.kind === kind ? commandPending.current : null) ??
      (kind === "start"
        ? {
            kind,
            settings,
            requestId: crypto.randomUUID(),
            expectedRevision: data.revision,
          }
        : {
            kind,
            lessonId: data.lesson!.id,
            requestId: crypto.randomUUID(),
            expectedRevision: data.revision,
          });
    commandPending.current = payload;
    setBusy(true);
    busyRef.current = true;
    setError("");
    try {
      const view = await api<TeacherView>(base + "?session=teacher", payload);
      setData(view);
      setSettings(view.settings);
      commandPending.current = null;
      setEnding(false);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status < 500)
        commandPending.current = null;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function showPreview() {
    if (!settings) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ protocols: PreviewProtocol[] }>(
        base + "/preview?session=teacher",
        data?.lesson?.status === "active" ? data.lesson.settings : settings,
      );
      setPreview(result.protocols);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const running = data?.lesson?.status === "active",
    completed =
      data?.students.filter((s) => s.status === "completed").length ?? 0;
  return (
    <>
      <Header homeHref="/teacher">
        <Link href="/teacher">ルーム管理</Link>
      </Header>
      <main className="judgment-teacher">
        <div className="judgment-section-heading">
          <h1>{data?.title ?? JUDGMENT_NAME}</h1>
          <span className="judgment-room-code">{code}</span>
        </div>
        {connectionError && (
          <p role="alert" className="error-message">
            {connectionError}
          </p>
        )}
        {needsLogin && (
          <Link className="button primary" href={`/teacher?code=${code}`}>
            教員として再入室
          </Link>
        )}
        {!data && !connectionError && <p role="status">読み込み中…</p>}
        {data && settings && (
          <>
            <div className="judgment-overview">
              <span>
                {running
                  ? `第${data.lesson!.number}回 実施中`
                  : data.lesson
                    ? "実施終了"
                    : "開始前"}
              </span>
              <span>
                参加者 <b>{data.students.length}</b> 人
              </span>
              <span>
                回答完了 <b>{completed}</b> 人
              </span>
              <Link href={`/?code=${code}`} target="_blank">
                学生の入室画面
              </Link>
            </div>
            <section className="judgment-panel">
              {running ? (
                <>
                  <h2>実施中の課題</h2>
                  <ul className="judgment-active-studies">
                    {data.lesson!.settings.studyIds.map((id) => (
                      <li key={id}>
                        {studies.find((s) => s.id === id)?.names.ja}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <SettingsFields
                  studies={studies}
                  settings={settings}
                  disabled={busy}
                  onChange={(value) => {
                    commandPending.current = null;
                    setSettings(value);
                  }}
                />
              )}
              <div className="judgment-actions">
                <button
                  className="button secondary"
                  disabled={busy || !settings.studyIds.length}
                  onClick={() => void showPreview()}
                >
                  学生画面をプレビュー
                </button>
                {running ? (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => setEnding(true)}
                  >
                    今回の実施を終了
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={busy || !settings.studyIds.length}
                    onClick={() => void command("start")}
                  >
                    {busy
                      ? "開始中…"
                      : data.lesson
                        ? "次の実施を開始"
                        : "実施を開始"}
                  </button>
                )}
              </div>
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
            </section>
            <section className="judgment-panel">
              <div className="judgment-section-heading">
                <h2>参加状況</h2>
                <div className="judgment-actions">
                  <a
                    className="button secondary small-button"
                    href={base + "/export?format=csv&session=teacher"}
                  >
                    CSV
                  </a>
                  <a
                    className="button secondary small-button"
                    href={base + "/export?format=json&session=teacher"}
                  >
                    全記録 JSON
                  </a>
                </div>
              </div>
              {data.students.length ? (
                <div className="judgment-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>学生証番号</th>
                        <th>状態</th>
                        <th>回答ページ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.students.map((s) => (
                        <tr key={s.studentId}>
                          <td>{s.studentId}</td>
                          <td>{s.status ? statuses[s.status] : "待機中"}</td>
                          <td>
                            {s.totalTrials
                              ? `${s.answered} / ${s.totalTrials}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">学生の入室を待っています。</p>
              )}
            </section>
            {data.history.length > 0 && (
              <section className="judgment-panel">
                <h2>実施履歴</h2>
                <ol className="judgment-history">
                  {data.history.map((lesson) => (
                    <li key={lesson.id}>
                      <strong>第{lesson.number}回</strong>
                      <span>
                        {lesson.settings.studyIds.length}課題 ·{" "}
                        {lesson.status === "active" ? "実施中" : "終了"}
                      </span>
                      <time>
                        {new Date(lesson.createdAt).toLocaleString("ja-JP", {
                          timeZone: "Asia/Tokyo",
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
      {preview && (
        <JudgmentPreview protocols={preview} onClose={() => setPreview(null)} />
      )}
      {ending && (
        <EndDialog
          busy={busy}
          error={error}
          onCancel={() => setEnding(false)}
          onConfirm={() => void command("end")}
        />
      )}
    </>
  );
}
function EndDialog({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="judgment-end-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="judgment-end-title">今回の実施を終了しますか？</h2>
      <p>回答中の学生も終了します。保存済みの回答は残ります。</p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button secondary" disabled={busy} onClick={onCancel}>
          戻る
        </button>
        <button className="button primary" disabled={busy} onClick={onConfirm}>
          {busy ? "終了中…" : "終了する"}
        </button>
      </div>
    </dialog>
  );
}
