"use client";

import { useState } from "react";
import { ArrowRight, FlaskConical, Info } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import {
  MAX_STUDY_MARKETS,
  MAX_STUDY_PARTICIPANTS,
  studyLayoutError,
  DEFAULT_STUDY_INSTITUTIONS,
  studyInstitutionOrders,
} from "@/lib/study-config";
import type { ServerStatus } from "@/lib/server/config";
import { Spinner } from "./shell";
import { StudyTimingFields } from "./study-timing-settings";
import {
  DEFAULT_STUDY_TIMING,
  studyTimingError,
  studyTimingForInstitutions,
} from "@/lib/study-timing";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { Institution } from "@/lib/study-types";

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
  const [institutions, setInstitutions] = useState<Institution[]>(() => [
    ...DEFAULT_STUDY_INSTITUTIONS,
  ]);
  const institutionError = institutions.length
    ? ""
    : "実施する制度を1つ以上選択してください。";
  const rounds = institutions.length * 5;
  const orderCount = institutions.length
    ? studyInstitutionOrders(institutions).length
    : 0;
  const count = Number(marketCount),
    size = Number(marketSize);
  const layoutError = studyLayoutError(count, size);
  const timingError = studyTimingError(timing, institutions);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      tab === "create" &&
      !legacy &&
      (layoutError || institutionError || timingError)
    ) {
      setError(layoutError || institutionError || timingError);
      return;
    }
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const selectedTiming = studyTimingForInstitutions(timing, institutions);
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
                    rounds,
                    duration: selectedTiming.cdaSeconds,
                    studyTiming: selectedTiming,
                    studyInstitutions: institutions,
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
                <fieldset
                  className="study-institution-picker"
                  aria-describedby="study-institution-help"
                >
                  <legend>実施する制度</legend>
                  <div className="study-institution-options">
                    {DEFAULT_STUDY_INSTITUTIONS.map((institution) => (
                      <label
                        className="study-institution-option"
                        key={institution}
                      >
                        <input
                          type="checkbox"
                          name="studyInstitutions"
                          value={institution}
                          checked={institutions.includes(institution)}
                          disabled={pending}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setInstitutions((previous) =>
                              DEFAULT_STUDY_INSTITUTIONS.filter((i) =>
                                i === institution
                                  ? checked
                                  : previous.includes(i),
                              ),
                            );
                          }}
                        />
                        {INSTITUTIONS[institution].short}
                      </label>
                    ))}
                  </div>
                  <p
                    id="study-institution-help"
                    className={
                      institutionError ? "error-message" : "field-help"
                    }
                    aria-live="polite"
                  >
                    {institutionError ||
                      `各制度5期・計${rounds}期。制度の選択はルーム作成後に変更できません。`}
                  </p>
                </fieldset>
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
                      6市場・96人
                      {orderCount > 0
                        ? `（${orderCount}通りの順序を${6 / orderCount}市場ずつ）`
                        : ""}
                    </option>
                    <option value="12">
                      12市場・192人
                      {orderCount > 0
                        ? `（${orderCount}通りの順序を${12 / orderCount}市場ずつ）`
                        : ""}
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
                    1商品を各自2単位、選択した{institutions.length}
                    制度を各5期、計{rounds}期実施します。
                    {count === 1
                      ? `制度の順序は${institutions.map((i) => INSTITUTIONS[i].short).join(" → ")}です。`
                      : `${orderCount}通りの制度順序を市場ごとに均等に割り当てます。`}
                    市場・役割は学生がそろってからランダムに割り当てます。
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
                  institutions={institutions}
                />
                {preset === "custom" && (
                  <p className="field-help">
                    1市場の人数は偶数、合計は{MAX_STUDY_PARTICIPANTS}
                    人以内。人数・市場数は作成後に変更できません。参加予定人数に合わせて設定してください。
                    {size !== 16 &&
                      "16人以外では、既定の価値・費用を全範囲から均等に抽出・複製します。作成後に教員画面で確認・変更できます。"}
                    {count > 1 &&
                      orderCount > 1 &&
                      count % orderCount !== 0 &&
                      `市場数が${orderCount}の倍数以外では、${orderCount}通りの制度順序の割当数に差が出ます。`}
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
                (!legacy &&
                  Boolean(layoutError || institutionError || timingError))))
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
                : "作成後は学生の入室を確認し、全員をランダムに割り当ててから実験を開始します。5秒後に全市場の取引が始まり、条件は固定されます。"}
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
