"use client";

import { useState } from "react";
import { ArrowRight, FlaskConical, Info } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import type { ServerStatus } from "@/lib/server/config";
import { Spinner } from "./shell";

export function TeacherForm({
  initialCode = "",
  status,
}: {
  initialCode?: string;
  status: ServerStatus;
}) {
  const [tab, setTab] = useState(initialCode ? "reenter" : "create");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const result =
        tab === "create"
          ? await api<{ code: string }>("/api/rooms", {
              config: {
                title: form.get("title"),
                capacity: Number(form.get("capacity")),
                rounds: Number(form.get("rounds")),
                duration: Number(form.get("duration")),
              },
              password: form.get("password"),
              accessKey: form.get("accessKey") || "",
            })
          : await api<{ code: string }>(
              `/api/rooms/${String(form.get("code")).toUpperCase()}/teacher`,
              { password: form.get("password") },
            );
      // Re-entry may switch back from a student's session in the same browser.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Discard the previous user's client-side room state.
      window.location.assign(`/room/${result.code}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="teacher-form-card panel">
      <div className="segmented">
        <button
          aria-pressed={tab === "create"}
          onClick={() => {
            setTab("create");
            setError("");
          }}
        >
          新しい実験
        </button>
        <button
          aria-pressed={tab === "reenter"}
          onClick={() => {
            setTab("reenter");
            setError("");
          }}
        >
          教員として再入室
        </button>
      </div>
      <form onSubmit={submit} key={tab}>
        {tab === "create" ? (
          <>
            <label className="field">
              実験名
              <input
                name="title"
                defaultValue="ダブルオークション実験"
                maxLength={60}
                required
              />
            </label>
            <div className="form-grid">
              <label className="field">
                参加人数
                <select name="capacity" defaultValue="12">
                  <option value="12">12人（買6・売6）</option>
                  <option value="24">24人（買12・売12）</option>
                  <option value="36">36人（買18・売18）</option>
                </select>
              </label>
              <label className="field">
                ラウンド数
                <input
                  type="number"
                  name="rounds"
                  defaultValue={6}
                  min={1}
                  max={12}
                  required
                />
              </label>
            </div>
            <label className="field">
              1ラウンドの取引時間
              <select name="duration" defaultValue="180">
                <option value="60">1分</option>
                <option value="120">2分</option>
                <option value="180">3分</option>
                <option value="300">5分</option>
                <option value="600">10分</option>
              </select>
            </label>
          </>
        ) : (
          <label className="field">
            ルームコード
            <input
              className="code-input"
              name="code"
              defaultValue={initialCode}
              placeholder="例：K7M4PX"
              required
              pattern="[A-Za-z2-9]{6}"
              maxLength={6}
              autoComplete="off"
            />
          </label>
        )}
        <label className="field">
          この実験の教員パスワード
          <input
            type="password"
            name="password"
            placeholder={
              tab === "create"
                ? "8文字以上で設定"
                : "作成時に設定したパスワード"
            }
            minLength={8}
            maxLength={128}
            required
            autoComplete={
              tab === "create" ? "new-password" : "current-password"
            }
          />
          <span className="field-help">
            別の端末から管理画面に戻る際に必要です。学生には共有しないでください。
          </span>
        </label>
        {tab === "create" && status.keyRequired && (
          <label className="field">
            教員用キー
            <input
              type="password"
              name="accessKey"
              required
              autoComplete="off"
            />
            <span className="field-help">
              アプリの管理者から共有されたキーを入力します。
            </span>
          </label>
        )}
        {tab === "create" && !status.ready && (
          <p className="error-message" role="alert">
            アプリの接続設定が完了していません。管理者がデータベースと教員用キーを設定してください。
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary full"
          disabled={pending || (tab === "create" && !status.ready)}
        >
          {pending ? (
            <Spinner />
          ) : (
            <>
              {tab === "create" ? "実験ルームを作成" : "管理画面に入る"}
              <ArrowRight size={17} />
            </>
          )}
        </button>
        {tab === "create" && (
          <div className="callout">
            <Info size={17} />
            <p>
              ルーム作成後、教員用画面で各商品の価値と費用を変更できます。参加人数がそろうと開始でき、実験開始後は条件が固定されます。
            </p>
          </div>
        )}
        {status.mode === "local" && (
          <p className="local-note">
            <FlaskConical size={14} />
            ローカル環境で実行中。データはこのコンピューターに保存されます。
          </p>
        )}
      </form>
    </div>
  );
}
