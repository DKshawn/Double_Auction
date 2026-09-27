"use client";

import { useState } from "react";
import { ArrowRight, KeyRound, LockKeyhole } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Spinner } from "./shell";

export function JoinForm({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const result = await api<{ code: string }>(
        `/api/rooms/${code.toUpperCase()}/join`,
        { nickname: String(data.get("nickname")).trim(), pin: data.get("pin") },
      );
      // Start with fresh room state after the authentication cookie changes.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Discard the previous user's client-side room state.
      window.location.assign(`/room/${result.code}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={join} className="join-form">
      <div className="form-eyebrow">
        <span className="icon-chip">
          <KeyRound size={19} />
        </span>
        学生の方
      </div>
      <h2>実験に参加する</h2>
      <p className="muted">教員から共有されたコードを入力してください。</p>
      <label className="field">
        ルームコード
        <input
          className="code-input"
          name="code"
          placeholder="例：K7M4PX"
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 6),
            )
          }
          required
          pattern="[A-Z2-9]{6}"
          minLength={6}
          maxLength={6}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="field">
        ニックネーム
        <input
          name="nickname"
          placeholder="例：学生01"
          required
          maxLength={20}
          autoComplete="nickname"
        />
        <span className="field-help">実名を使う必要はありません。</span>
      </label>
      <label className="field">
        再入室用の暗証番号
        <input
          type="password"
          name="pin"
          inputMode="numeric"
          placeholder="数字6桁を決めてください"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
          autoComplete="new-password"
        />
        <span className="field-help">
          再入室には同じ名前と暗証番号を使います。
        </span>
      </label>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={pending}>
        {pending ? (
          <Spinner />
        ) : (
          <>
            入室する
            <ArrowRight size={17} />
          </>
        )}
      </button>
      <div className="form-footnote">
        <LockKeyhole size={14} />
        あなたの価値・費用は、他の学生には非公開です。
      </div>
    </form>
  );
}
