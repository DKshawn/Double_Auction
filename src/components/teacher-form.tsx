"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FlaskConical, Info } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Spinner } from "./shell";

export function TeacherForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialCode ? "reenter" : "create");
  const [status, setStatus] = useState<{
    mode: string;
    ready: boolean;
    keyRequired: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ mode: string; ready: boolean; keyRequired: boolean }>("/api/status")
      .then(setStatus)
      .catch(() =>
        setError(
          "サーバーの設定を確認できません。ページを再読み込みしてください。",
        ),
      );
  }, []);
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
      router.push(`/room/${result.code}`);
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
        {tab === "create" && status?.keyRequired && (
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
        {status && !status.ready && (
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
          disabled={pending || (tab === "create" && (!status || !status.ready))}
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
              参加人数がそろうと開始できます。役割と価値・費用は全ラウンドを通して固定され、各商品を1回ずつ取引できます。
            </p>
          </div>
        )}
        {status?.mode === "local" && (
          <p className="local-note">
            <FlaskConical size={14} />
            ローカル環境で実行中。データはこのコンピューターに保存されます。
          </p>
        )}
      </form>
    </div>
  );
}
