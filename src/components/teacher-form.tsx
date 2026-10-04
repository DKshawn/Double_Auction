"use client";

import { useState } from "react";
import { ArrowRight, FlaskConical, Info } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import {
  MAX_STUDY_MARKETS,
  MAX_STUDY_PARTICIPANTS,
  studyLayoutError,
} from "@/lib/study-config";
import type { ServerStatus } from "@/lib/server/config";
import { Spinner } from "./shell";
import { StudyTimingFields } from "./study-timing-settings";
import { DEFAULT_STUDY_TIMING, studyTimingError } from "@/lib/study-timing";

export function TeacherForm({
  initialCode = "",
  status,
  legacy = false,
}: {
  initialCode?: string;
  status: ServerStatus;
  legacy?: boolean;
}) {
  const [tab, setTab] = useState(initialCode ? "reenter" : "create");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState("1");
  const [marketCount, setMarketCount] = useState("1");
  const [marketSize, setMarketSize] = useState("16");
  const [timing, setTiming] = useState(() => ({ ...DEFAULT_STUDY_TIMING }));
  const count = Number(marketCount),
    size = Number(marketSize);
  const layoutError = studyLayoutError(count, size);
  const timingError = studyTimingError(timing);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tab === "create" && !legacy && (layoutError || timingError)) {
      setError(layoutError || timingError);
      return;
    }
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const result =
        tab === "create"
          ? await api<{ code: string }>("/api/rooms", {
              config: legacy
                ? {
                    title: form.get("title"),
                    capacity: Number(form.get("capacity")),
                    rounds: Number(form.get("rounds")),
                    duration: Number(form.get("duration")),
                  }
                : {
                    protocol: "institutions-v1",
                    title: form.get("title"),
                    markets: count,
                    marketSize: size,
                    capacity: count * size,
                    rounds: 15,
                    duration: timing.cdaSeconds,
                    studyTiming: timing,
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
                defaultValue={
                  legacy ? "ダブルオークション実験" : "実験1：市場制度の比較"
                }
                maxLength={60}
                required
              />
            </label>
            {legacy ? (
              <>
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
              <>
                <label className="field">
                  市場数・参加人数
                  <select
                    name="marketPreset"
                    value={preset}
                    onChange={(event) => {
                      setPreset(event.target.value);
                      if (event.target.value !== "custom") {
                        setMarketCount(event.target.value);
                        setMarketSize("16");
                      }
                    }}
                  >
                    <option value="1">1市場・16人（授業・動作確認）</option>
                    <option value="6">
                      6市場・96人（6通りの順序を1市場ずつ）
                    </option>
                    <option value="12">
                      12市場・192人（6通りの順序を2市場ずつ）
                    </option>
                    <option value="custom">
                      カスタム（人数・市場数を指定）
                    </option>
                  </select>
                </label>
                {preset === "custom" && (
                  <div className="form-grid">
                    <label className="field">
                      1市場の人数
                      <input
                        type="number"
                        name="marketSize"
                        min={2}
                        max={MAX_STUDY_PARTICIPANTS}
                        step={2}
                        required
                        value={marketSize}
                        onChange={(e) => setMarketSize(e.target.value)}
                        aria-describedby="study-layout-help"
                      />
                    </label>
                    <label className="field">
                      市場数
                      <input
                        type="number"
                        name="markets"
                        min={1}
                        max={MAX_STUDY_MARKETS}
                        step={1}
                        required
                        value={marketCount}
                        onChange={(e) => setMarketCount(e.target.value)}
                        aria-describedby="study-layout-help"
                      />
                    </label>
                  </div>
                )}
                <p
                  id="study-layout-help"
                  className={layoutError ? "error-message" : "field-help"}
                  aria-live="polite"
                >
                  {layoutError ||
                    `${size}人 × ${count}市場 ＝ 合計${size * count}人。各市場は買い手${size / 2}人・売り手${size / 2}人です。`}
                </p>
                <div className="callout">
                  <Info size={18} />
                  <p>
                    1商品を各自2単位、3制度を各5期、計15期実施します。市場・役割は自動割当です。1市場の場合はCDA
                    → Call → Posted Offerの順です。
                  </p>
                </div>
                <h3>実験時間の設定</h3>
                <p className="field-help">
                  時間・価値・費用の条件は全市場で共通です。作成後も実験開始前なら教員画面で変更できます。
                </p>
                <StudyTimingFields
                  timing={timing}
                  onChange={setTiming}
                  disabled={pending}
                />
                {preset === "custom" && (
                  <p className="field-help">
                    1市場の人数は偶数、合計は{MAX_STUDY_PARTICIPANTS}
                    人以内。人数・市場数は作成後に変更できません。参加予定人数に合わせて設定してください。
                    {size !== 16 &&
                      "16人以外では、既定の価値・費用を全範囲から均等に抽出・複製します。作成後に教員画面で確認・変更できます。"}
                    {count > 1 &&
                      count % 6 !== 0 &&
                      "市場数が6の倍数以外では、6通りの制度順序の割当数に差が出ます。"}
                  </p>
                )}
              </>
            )}
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
          disabled={
            pending ||
            (tab === "create" &&
              (!status.ready ||
                (!legacy && Boolean(layoutError || timingError))))
          }
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
              {legacy
                ? "ルーム作成後、教員用画面で各商品の価値と費用を変更できます。"
                : "ルーム作成後、教員用画面で全員の価値・費用を確認・変更できます。"}
              {legacy
                ? "参加人数がそろうと開始でき、実験開始後は条件が固定されます。"
                : "教員が実験を開始した後、各市場が設定人数に達すると自動で取引が始まります。実験開始後は条件が固定されます。"}
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
