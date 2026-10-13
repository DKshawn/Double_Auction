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
  DEFAULT_STUDY_PERIODS,
  MAX_INSTITUTION_PERIODS,
  studyPeriodCount,
  studyTotalRounds,
  studyPeriodsError,
  studyInstitutions,
  studyMarketSize,
  resizeStudySettings,
} from "@/lib/study-config";
import type { ServerStatus } from "@/lib/server/config";
import { Spinner } from "./shell";
import { StudyTimingFields } from "./study-timing-settings";
import {
  DEFAULT_STUDY_COMMISSION,
  studyCommission,
  studyCommissionError,
} from "@/lib/study-commission";
import {
  DEFAULT_STUDY_TIMING,
  studyTimingError,
  studyTimingForInstitutions,
} from "@/lib/study-timing";
import { INSTITUTIONS } from "@/lib/study-rules";
import type {
  Institution,
  StudyPeriods,
  StudyGeneratorConfig,
  StudySettings,
} from "@/lib/study-types";
import { TeacherRooms } from "./teacher-rooms";
import type { RoomConfig } from "@/lib/types";
import { studyRoomConfigSchema } from "@/lib/study-room-config";
import { StudyPresetPicker } from "./study-preset-picker";
import { generatedStudySettings } from "@/lib/study-generator";

export function TeacherForm({
  initialCode = "",
  status,
  legacy = false,
  initialConfig,
  initialGenerator,
  conditionPreset,
  onCreateDemo,
}: {
  initialCode?: string;
  status: ServerStatus;
  legacy?: boolean;
  initialConfig?: RoomConfig;
  initialGenerator?: StudyGeneratorConfig;
  conditionPreset?: { label: string; settings: StudySettings };
  onCreateDemo?: (config: RoomConfig, generator?: StudyGeneratorConfig) => void;
}) {
  const [tab, setTab] = useState(
    !onCreateDemo && initialCode ? "reenter" : "create",
  );
  const [reenterCode, setReenterCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState(() =>
    !initialConfig
      ? "1"
      : studyMarketSize(initialConfig) === 16 &&
          [1, 6, 12].includes(initialConfig.markets!)
        ? String(initialConfig.markets)
        : "custom",
  );
  const [marketCount, setMarketCount] = useState(
    String(initialConfig?.markets ?? 1),
  );
  const [marketSize, setMarketSize] = useState(
    String(studyMarketSize(initialConfig ?? {})),
  );
  const [timing, setTiming] = useState(() => ({
    ...DEFAULT_STUDY_TIMING,
    ...initialConfig?.studyTiming,
  }));
  const [commission, setCommission] = useState(() =>
    initialConfig ? studyCommission(initialConfig) : DEFAULT_STUDY_COMMISSION,
  );
  const [institutions, setInstitutions] = useState<Institution[]>(() => [
    ...studyInstitutions(initialConfig ?? {}),
  ]);
  const [periods, setPeriods] = useState<StudyPeriods>(() => ({
    ...DEFAULT_STUDY_PERIODS,
    ...initialConfig?.studyPeriods,
  }));
  const [adoptedConditions, setAdoptedConditions] = useState<{
    marketSize: number;
    generator?: StudyGeneratorConfig;
    settings?: StudySettings;
  } | null>(() => ({
    marketSize: studyMarketSize(initialConfig ?? {}),
    settings: initialGenerator
      ? generatedStudySettings(
          initialGenerator,
          studyMarketSize(initialConfig ?? {}),
        )
      : conditionPreset
        ? resizeStudySettings(
            conditionPreset.settings,
            studyMarketSize(initialConfig ?? {}),
          )
        : undefined,
    ...(initialGenerator
      ? { generator: structuredClone(initialGenerator) }
      : {}),
  }));
  const institutionError = institutions.length
    ? ""
    : "実施する制度を1つ以上選択してください。";
  const periodsError = studyPeriodsError(periods, institutions);
  const rounds = studyTotalRounds({
    studyInstitutions: institutions,
    studyPeriods: periods,
  });
  const orderCount = institutions.length
    ? studyInstitutionOrders(institutions).length
    : 0;
  const count = Number(marketCount),
    size = Number(marketSize);
  const layoutError = studyLayoutError(count, size);
  const timingError = studyTimingError(timing, institutions);
  const commissionError = studyCommissionError(
    commission,
    adoptedConditions?.settings,
  );
  const conditionError =
    !adoptedConditions || adoptedConditions.marketSize !== size
      ? "供需条件を生成・プレビューし、確認して採用してください。"
      : "";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      tab === "create" &&
      !legacy &&
      (layoutError ||
        institutionError ||
        periodsError ||
        timingError ||
        commissionError ||
        conditionError)
    ) {
      setError(
        layoutError ||
          institutionError ||
          periodsError ||
          timingError ||
          commissionError ||
          conditionError,
      );
      return;
    }
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const selectedTiming = studyTimingForInstitutions(timing, institutions);
      const config: RoomConfig = legacy
        ? {
            title: String(form.get("title")),
            capacity: Number(form.get("capacity")),
            rounds: Number(form.get("rounds")),
            duration: Number(form.get("duration")),
          }
        : {
            protocol: "institutions-v1",
            title: String(form.get("title")),
            markets: count,
            marketSize: size,
            capacity: count * size,
            rounds,
            duration: selectedTiming.cdaSeconds,
            studyTiming: selectedTiming,
            studyCommission: commission,
            studyInstitutions: institutions,
            studyPeriods: Object.fromEntries(
              institutions.map((i) => [i, periods[i]]),
            ),
          };
      if (onCreateDemo) {
        const parsed = studyRoomConfigSchema.safeParse(config);
        if (!parsed.success) {
          setError("実験名・人数・期数・時間の入力内容を確認してください。");
          return;
        }
        onCreateDemo(parsed.data, adoptedConditions?.generator);
        return;
      }
      const result =
        tab === "create"
          ? await api<{ code: string }>("/api/rooms", {
              config,
              password: form.get("password"),
              accessKey: form.get("accessKey") || "",
              ...(!legacy && adoptedConditions?.generator
                ? { generator: adoptedConditions.generator }
                : {}),
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
  const studyCreation = tab === "create" && !legacy;
  const conditionHeading = (
    <h2 id="teacher-condition-heading">供需条件の設定</h2>
  );
  const conditionFooter = conditionError ? (
    <p className="field-help" role="status">
      {conditionError}
    </p>
  ) : (
    <p className="callout teacher-adopted-conditions" role="status">
      作成時の条件：
      {adoptedConditions?.generator
        ? `横向き重なり階段 ／ p=${adoptedConditions.generator.parameters.p}・K=${adoptedConditions.generator.parameters.K}・L=${adoptedConditions.generator.parameters.L}・d=${adoptedConditions.generator.parameters.d} ／ シード ${adoptedConditions.generator.seed}`
        : `${conditionPreset?.label ?? "Default"}（既定）`}
      ／ Commission 各{commission}円・1単位
    </p>
  );
  const conditionSection = (
    <div className="teacher-condition-layout">
      {!layoutError ? (
        <StudyPresetPicker
          key={size}
          existingPreset={
            conditionPreset
              ? {
                  label: conditionPreset.label,
                  settings: resizeStudySettings(conditionPreset.settings, size),
                }
              : undefined
          }
          units={size}
          initialGenerator={initialGenerator}
          disabled={pending}
          commission={commission}
          onCommissionChange={setCommission}
          keepPreview
          settingsPanel={{
            heading: conditionHeading,
            footer: conditionFooter,
            labelledBy: "teacher-condition-heading",
          }}
          actionLabel="この条件を確認して採用"
          onDraftChange={() => setAdoptedConditions(null)}
          onConfirm={(preview) => {
            setAdoptedConditions({
              marketSize: size,
              generator: preview.generator,
              settings: preview.settings,
            });
            setError("");
            return true;
          }}
        />
      ) : (
        <section
          className="panel teacher-condition-settings"
          aria-labelledby="teacher-condition-heading"
        >
          {conditionHeading}
          {conditionFooter}
        </section>
      )}
    </div>
  );
  return (
    <div
      className={`teacher-form-card ${studyCreation ? "teacher-create-card" : "panel"}`}
    >
      {!onCreateDemo && (
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
          <button
            aria-pressed={tab === "manage"}
            onClick={() => {
              setTab("manage");
              setError("");
            }}
          >
            ルーム管理
          </button>
        </div>
      )}
      {tab === "manage" ? (
        <TeacherRooms
          status={status}
          onEnter={(code) => {
            setReenterCode(code);
            setError("");
            setTab("reenter");
          }}
        />
      ) : (
        <form
          onSubmit={submit}
          key={tab}
          className={studyCreation ? "teacher-create-layout" : undefined}
        >
          <div className="teacher-primary-settings">
            {tab === "create" ? (
              <>
                <section
                  className={
                    studyCreation ? "teacher-settings-section panel" : undefined
                  }
                >
                  {studyCreation && <h2>ルームの基本設定</h2>}
                  <label className="field">
                    実験名
                    <input
                      name="title"
                      defaultValue={
                        initialConfig?.title ??
                        (onCreateDemo
                          ? "ひとりデモ"
                          : legacy
                            ? "ダブルオークション実験"
                            : "実験1：市場制度の比較")
                      }
                      maxLength={60}
                      required
                    />
                  </label>
                </section>
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
                      className="study-institution-picker teacher-settings-section panel"
                      aria-describedby={
                        institutionError || periodsError
                          ? "study-institution-help"
                          : undefined
                      }
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
                      <h3
                        className="study-period-heading"
                        id="study-period-heading"
                      >
                        期数
                      </h3>
                      <div
                        className="study-period-fields"
                        role="group"
                        aria-labelledby="study-period-heading"
                      >
                        {institutions.map((institution) => (
                          <label className="field" key={institution}>
                            {INSTITUTIONS[institution].short}
                            <input
                              type="number"
                              name={`studyPeriods.${institution}`}
                              min={1}
                              max={MAX_INSTITUTION_PERIODS}
                              step={1}
                              required
                              disabled={pending}
                              value={periods[institution] || ""}
                              aria-label={`${INSTITUTIONS[institution].short}の期数`}
                              aria-describedby={
                                institutionError || periodsError
                                  ? "study-institution-help"
                                  : undefined
                              }
                              onChange={(event) =>
                                setPeriods((previous) => ({
                                  ...previous,
                                  [institution]: Number(event.target.value),
                                }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      {(institutionError || periodsError) && (
                        <p
                          id="study-institution-help"
                          className="error-message"
                          aria-live="polite"
                        >
                          {institutionError || periodsError}
                        </p>
                      )}
                    </fieldset>
                    <section
                      className="teacher-settings-section panel"
                      aria-labelledby="teacher-market-heading"
                    >
                      <h2 id="teacher-market-heading">市場・参加人数</h2>
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
                          <option value="1">
                            1市場・16人（授業・動作確認）
                          </option>
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
                        {institutionError || periodsError || layoutError ? (
                          <p>
                            制度・期数・人数を設定すると、実験の概要を表示します。
                          </p>
                        ) : (
                          <p>
                            1商品を各自2単位、選択した{institutions.length}
                            制度を設定した期数で、計{rounds}期実施します。
                            {institutions
                              .map(
                                (i) =>
                                  `${INSTITUTIONS[i].short} ${studyPeriodCount({ studyPeriods: periods }, i)}期`,
                              )
                              .join("・")}
                            。
                            {count === 1
                              ? `制度の順序は${institutions.map((i) => INSTITUTIONS[i].short).join(" → ")}です。`
                              : `${orderCount}通りの制度順序を市場ごとに均等に割り当てます。`}
                            市場・役割は学生がそろってからランダムに割り当てます。
                          </p>
                        )}
                      </div>
                      {preset === "custom" && (
                        <p className="field-help">
                          1市場の人数は偶数、合計は{MAX_STUDY_PARTICIPANTS}
                          人以内。人数・市場数は作成後に変更できません。
                          {size !== 16 &&
                            "16人以外では、既定の価値・費用を全範囲から均等に抽出・複製します。"}
                          {count > 1 &&
                            orderCount > 1 &&
                            count % orderCount !== 0 &&
                            `市場数が${orderCount}の倍数以外では、制度順序の割当数に差が出ます。`}
                        </p>
                      )}
                    </section>
                    <section
                      className="teacher-settings-section panel"
                      aria-labelledby="teacher-timing-heading"
                    >
                      <h2 id="teacher-timing-heading">実験時間の設定</h2>
                      <p className="field-help">
                        時間・価値・費用の条件は全市場で共通です。作成後も実験開始前なら教員画面で変更できます。
                      </p>
                      <StudyTimingFields
                        timing={timing}
                        onChange={setTiming}
                        disabled={pending}
                        institutions={institutions}
                      />
                    </section>
                  </>
                )}
              </>
            ) : (
              <label className="field">
                ルームコード
                <input
                  className="code-input"
                  name="code"
                  defaultValue={reenterCode}
                  placeholder="例：K7M4PX"
                  required
                  pattern="[A-Za-z2-9]{6}"
                  maxLength={6}
                  autoComplete="off"
                />
              </label>
            )}
            {!onCreateDemo && (
              <section
                className={
                  studyCreation ? "teacher-settings-section panel" : undefined
                }
              >
                {studyCreation && <h2>教員のアクセス</h2>}
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
              </section>
            )}
          </div>
          {studyCreation && conditionSection}
          <div className="teacher-form-actions">
            {!onCreateDemo && tab === "create" && !status.ready && (
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
                  ((!onCreateDemo && !status.ready) ||
                    (!legacy &&
                      Boolean(
                        layoutError ||
                        institutionError ||
                        periodsError ||
                        timingError ||
                        commissionError ||
                        conditionError,
                      ))))
              }
            >
              {pending ? (
                <Spinner />
              ) : (
                <>
                  {onCreateDemo
                    ? "デモルームを作成"
                    : tab === "create"
                      ? "実験ルームを作成"
                      : "管理画面に入る"}
                  {tab !== "create" && <ArrowRight size={17} />}
                </>
              )}
            </button>
            {tab === "create" && legacy && !onCreateDemo && (
              <div className="callout">
                <Info size={17} />
                <p>
                  ルーム作成後、教員用画面で各商品の価値と費用を変更できます。参加人数がそろうと開始でき、実験開始後は条件が固定されます。
                </p>
              </div>
            )}
            {(onCreateDemo || status.mode === "local") && (
              <p className="local-note">
                <FlaskConical size={14} />
                {onCreateDemo
                  ? "デモの進行はこの画面内で保持されます。再読み込みすると実験設定からやり直せます。"
                  : "ローカル環境で実行中。データはこのコンピューターに保存されます。"}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
