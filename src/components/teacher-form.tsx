"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, FlaskConical, Info } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import {
  MAX_STUDY_MARKETS,
  MAX_STUDY_PARTICIPANTS,
  studyLayoutError,
  studyInstitutionOrders,
  DEFAULT_STUDY_PERIODS,
  studyTotalRounds,
  studyPeriodsError,
  studyInstitutions,
  studyMarketSize,
  resizeStudySettings,
  studyUnits,
  studyUnitsError,
} from "@/lib/study-config";
import type { ServerStatus } from "@/lib/server/config";
import { Spinner } from "./shell";
import { StudyProgramFields } from "./study-program-fields";
import { StudyDetailDialog } from "./study-detail-dialog";
import { StudySetupStep } from "./study-setup-step";
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
import {
  StudyPresetPicker,
  type StudyPresetPreview,
} from "./study-preset-picker";
import { generatedStudySettings } from "@/lib/study-generator";
import { StudyUnitFields } from "./study-unit-settings";
import { teacherRoomHref } from "@/lib/room-navigation";

export function TeacherForm({
  initialCode = "",
  initialTab,
  status,
  legacy = false,
  initialConfig,
  initialGenerator,
  conditionPreset,
  onCreateDemo,
}: {
  initialCode?: string;
  initialTab?: "manage" | "create" | "reenter";
  status: ServerStatus;
  legacy?: boolean;
  initialConfig?: RoomConfig;
  initialGenerator?: StudyGeneratorConfig;
  conditionPreset?: { label: string; settings: StudySettings };
  onCreateDemo?: (config: RoomConfig, generator?: StudyGeneratorConfig) => void;
}) {
  const [tab, setTab] = useState(
    initialTab ?? (!onCreateDemo && initialCode ? "reenter" : "create"),
  );
  const [reenterCode, setReenterCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(
    initialConfig?.title ??
      (onCreateDemo
        ? "ひとりデモ"
        : legacy
          ? "ダブルオークション実験"
          : "実験1：市場制度の比較"),
  );
  const [configureFirst, setConfigureFirst] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(
    initialConfig?.studySetupConfirmed === true,
  );
  const [configurationStep, setConfigurationStep] = useState(0);
  const [configurationProgress, setConfigurationProgress] = useState(0);
  const configurationId = useId();
  useEffect(() => {
    if (configureFirst) {
      document
        .getElementById(`${configurationId}-heading-${configurationStep}`)
        ?.focus({ preventScroll: true });
    }
  }, [configureFirst, configurationId, configurationStep]);
  const settingsDisabled = pending;
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
  const [cdaUnits, setCdaUnits] = useState(
    String(studyUnits(initialConfig ?? {})),
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
    units: number;
    generator?: StudyGeneratorConfig;
    settings?: StudySettings;
    otherSettings?: StudySettings;
  } | null>(() => ({
    marketSize: studyMarketSize(initialConfig ?? {}),
    units: studyUnits(initialConfig ?? {}),
    settings: initialGenerator
      ? generatedStudySettings(
          initialGenerator,
          (studyMarketSize(initialConfig ?? {}) / 2) *
            studyUnits(initialConfig ?? {}),
          studyUnits(initialConfig ?? {}),
        )
      : conditionPreset
        ? resizeStudySettings(
            conditionPreset.settings,
            studyMarketSize(initialConfig ?? {}),
            studyUnits(initialConfig ?? {}),
          )
        : undefined,
    ...(initialGenerator
      ? { generator: structuredClone(initialGenerator) }
      : {}),
    ...(studyUnits(initialConfig ?? {}) !== 2 &&
    studyInstitutions(initialConfig ?? {}).some((i) => i !== "cda")
      ? {
          otherSettings: initialGenerator
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
        }
      : {}),
  }));
  function configurationSnapshot() {
    return {
      preset,
      marketCount,
      marketSize,
      cdaUnits,
      timing,
      commission,
      institutions,
      periods,
      adoptedConditions,
    };
  }
  const savedConfiguration = useRef<ReturnType<
    typeof configurationSnapshot
  > | null>(null);
  function openConfiguration() {
    savedConfiguration.current = structuredClone(configurationSnapshot());
    setError("");
    setConfigurationStep(0);
    setConfigurationProgress(detailsSaved ? 2 : 0);
    setConfigureFirst(true);
  }
  function cancelConfiguration() {
    const saved = savedConfiguration.current;
    if (saved) {
      setPreset(saved.preset);
      setMarketCount(saved.marketCount);
      setMarketSize(saved.marketSize);
      setCdaUnits(saved.cdaUnits);
      setTiming(saved.timing);
      setCommission(saved.commission);
      setInstitutions(saved.institutions);
      setPeriods(saved.periods);
      setAdoptedConditions(saved.adoptedConditions);
    }
    savedConfiguration.current = null;
    setError("");
    setConfigureFirst(false);
  }
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
  const units = institutions.includes("cda") ? Number(cdaUnits) : 2;
  const unitsError = studyUnitsError(units);
  const otherSettings =
    units !== 2 && institutions.some((i) => i !== "cda") && conditionPreset
      ? resizeStudySettings(conditionPreset.settings, size)
      : undefined;
  const layoutError = studyLayoutError(count, size, true);
  const timingError = studyTimingError(timing, institutions);
  const commissionError = studyCommissionError(
    commission,
    adoptedConditions?.settings,
    institutions.some((i) => i !== "cda")
      ? adoptedConditions?.otherSettings
      : undefined,
  );
  const conditionsPending =
    !adoptedConditions ||
    adoptedConditions.marketSize !== size ||
    adoptedConditions.units !== units;
  const configurationError =
    layoutError ||
    unitsError ||
    institutionError ||
    periodsError ||
    timingError ||
    commissionError;
  const stepError = [
    institutionError || periodsError || timingError,
    layoutError,
    configurationError,
  ][configurationStep];
  function nextConfigurationStep() {
    if (stepError) return;
    const next = Math.min(2, configurationStep + 1);
    setConfigurationProgress((previous) => Math.max(previous, next));
    setConfigurationStep(next);
    setError("");
  }
  function saveConfiguration(preview: StudyPresetPreview, amount: number) {
    const invalid =
      (!title.trim() ? "実験名を入力してください。" : "") ||
      layoutError ||
      unitsError ||
      institutionError ||
      periodsError ||
      timingError ||
      studyCommissionError(amount, preview.settings, preview.otherSettings);
    if (invalid) {
      setError(invalid);
      return false;
    }
    setAdoptedConditions({
      marketSize: size,
      units,
      generator: preview.generator,
      settings: preview.settings,
      otherSettings: preview.otherSettings,
    });
    setCommission(amount);
    savedConfiguration.current = null;
    setDetailsSaved(true);
    setError("");
    setConfigureFirst(false);
    return true;
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      tab === "create" &&
      !legacy &&
      (layoutError ||
        unitsError ||
        institutionError ||
        periodsError ||
        timingError ||
        commissionError ||
        conditionsPending)
    ) {
      setError(
        layoutError ||
          unitsError ||
          institutionError ||
          periodsError ||
          timingError ||
          commissionError,
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
            studyAdmission: "flexible",
            ...(detailsSaved ? { studySetupConfirmed: true } : {}),
            title,
            markets: count,
            marketSize: size,
            capacity: Math.min(MAX_STUDY_PARTICIPANTS, count * size),
            rounds,
            duration: selectedTiming.cdaSeconds,
            studyTiming: selectedTiming,
            studyCommission: commission,
            studyCdaUnits: units,
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
      window.location.assign(teacherRoomHref(result.code));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  const studyCreation = tab === "create" && !legacy;
  const conditionHeading = (
    <h2 id="teacher-condition-heading">供需プリセット</h2>
  );
  const conditionSection = (
    <div className="teacher-condition-layout">
      <StudyPresetPicker
        existingPreset={
          conditionPreset && !layoutError && !unitsError
            ? {
                label: conditionPreset.label,
                settings: resizeStudySettings(
                  conditionPreset.settings,
                  size,
                  units,
                ),
              }
            : undefined
        }
        units={(size / 2) * units}
        unitsPerParticipant={units}
        otherSettings={otherSettings}
        otherUnits={
          units !== 2 && institutions.some((i) => i !== "cda")
            ? size
            : undefined
        }
        initialGenerator={adoptedConditions?.generator}
        disabled={pending}
        validationError={
          layoutError ||
          unitsError ||
          institutionError ||
          periodsError ||
          timingError
        }
        renderUnitFields={(fieldsDisabled) => (
          <StudyUnitFields
            cdaUnits={cdaUnits}
            onChange={(value) => {
              setCdaUnits(value);
              setAdoptedConditions(null);
              setError("");
            }}
            disabled={fieldsDisabled}
            institutions={institutions}
          />
        )}
        commission={commission}
        onCommissionChange={setCommission}
        settingsPanel={{
          heading: conditionHeading,
          labelledBy: "teacher-condition-heading",
        }}
        actionLabel="設定を保存して閉じる"
        onDraftChange={() => {
          setAdoptedConditions(null);
          setError("");
        }}
        onConfirm={saveConfiguration}
      />
    </div>
  );
  const configurationActions = (
    <div className="teacher-configuration-step-actions">
      {stepError && (
        <p className="error-message" role="alert">
          {stepError}
        </p>
      )}
      {error && error !== stepError && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="study-actions">
        <button
          type="button"
          className="button primary"
          disabled={pending || Boolean(stepError)}
          onClick={nextConfigurationStep}
        >
          確定して次へ
        </button>
      </div>
    </div>
  );
  return (
    <div className="panel teacher-form-card">
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
          className={
            studyCreation
              ? "teacher-create-layout teacher-create-quick"
              : undefined
          }
        >
          <div className="teacher-primary-settings">
            {tab === "create" ? (
              <>
                <section
                  className={
                    studyCreation ? "teacher-settings-section panel" : undefined
                  }
                >
                  {studyCreation && <h2>ルームの設定</h2>}
                  <label className="field">
                    実験名
                    <input
                      name="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={pending}
                      maxLength={60}
                      required
                    />
                  </label>
                  {studyCreation && (
                    <button
                      type="button"
                      className="button secondary"
                      aria-haspopup="dialog"
                      onClick={openConfiguration}
                    >
                      作成前に詳細を設定
                    </button>
                  )}
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
                ) : null}
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
                {studyCreation && <h2>教員アクセス</h2>}
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
                        unitsError ||
                        institutionError ||
                        periodsError ||
                        timingError ||
                        commissionError ||
                        conditionsPending,
                      ))))
              }
            >
              {pending ? (
                <Spinner />
              ) : (
                <>
                  {tab === "create" ? "ルーム作成" : "管理画面に入る"}
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
      {studyCreation && configureFirst && (
        <StudyDetailDialog
          label="実験の詳細設定"
          className="teacher-configuration-dialog study-compact-settings"
          open
          onClose={cancelConfiguration}
        >
          <div className="panel study-setup">
            <header className="study-setup-heading">
              <h2>実験の準備</h2>
              <span>ステップ {configurationStep + 1} / 3</span>
            </header>
            <StudySetupStep
              id={configurationId}
              index={0}
              label="制度と進行"
              summary={institutions
                .map((i) => `${INSTITUTIONS[i].short} ${periods[i]}期`)
                .join(" · ")}
              expanded={configurationStep === 0}
              complete={configurationProgress > 0}
              disabled={pending}
              onOpen={() => setConfigurationStep(0)}
            >
              <StudyProgramFields
                institutions={institutions}
                periods={periods}
                timing={timing}
                onInstitutionsChange={setInstitutions}
                onPeriodsChange={setPeriods}
                onTimingChange={setTiming}
                disabled={settingsDisabled}
                marketSize={size}
              />
              {configurationStep === 0 && configurationActions}
            </StudySetupStep>
            <StudySetupStep
              id={configurationId}
              index={1}
              label="市場・人数"
              summary={`${count}市場 · ${size}人／市場`}
              expanded={configurationStep === 1}
              complete={configurationProgress > 1}
              disabled={pending || configurationProgress < 1}
              onOpen={() => setConfigurationStep(1)}
            >
              <label className="field">
                市場数・人数
                <select
                  name="marketPreset"
                  value={preset}
                  disabled={settingsDisabled}
                  onChange={(event) => {
                    setPreset(event.target.value);
                    if (event.target.value !== "custom") {
                      setMarketCount(event.target.value);
                      setMarketSize("16");
                    }
                  }}
                >
                  <option value="1">1市場・16人</option>
                  <option value="6">6市場・96人</option>
                  <option value="12">12市場・192人</option>
                  <option value="custom">カスタム</option>
                </select>
              </label>
              {preset === "custom" && (
                <div className="form-grid">
                  <label className="field">
                    人数
                    <input
                      type="number"
                      name="marketSize"
                      min={2}
                      max={MAX_STUDY_PARTICIPANTS}
                      step={2}
                      required
                      value={marketSize}
                      disabled={settingsDisabled}
                      onChange={(e) => setMarketSize(e.target.value)}
                      aria-describedby={
                        layoutError ? "study-layout-help" : undefined
                      }
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
                      disabled={settingsDisabled}
                      onChange={(e) => setMarketCount(e.target.value)}
                      aria-describedby={
                        layoutError ? "study-layout-help" : undefined
                      }
                    />
                  </label>
                </div>
              )}
              {layoutError && (
                <p
                  id="study-layout-help"
                  className="error-message"
                  role="alert"
                >
                  {layoutError}
                </p>
              )}
              {preset === "custom" && (
                <p className="field-help">
                  条件テンプレートは偶数人数で設定します。実際の参加者は最大
                  {MAX_STUDY_PARTICIPANTS}
                  人まで受け付け、奇数でも全員を割り当てます。市場数は入室受付中も変更できます。
                  {size !== 16 &&
                    "16人以外では、既定の価値・費用を全範囲から均等に抽出・複製します。"}
                  {count > 1 &&
                    orderCount > 1 &&
                    count % orderCount !== 0 &&
                    `市場数が${orderCount}の倍数以外では、制度順序の割当数に差が出ます。`}
                </p>
              )}
              {configurationStep === 1 && configurationActions}
            </StudySetupStep>
            <StudySetupStep
              id={configurationId}
              index={2}
              label="供需条件"
              summary={`${adoptedConditions?.generator ? "カスタム" : (conditionPreset?.label ?? "Default")} · ${institutions.map((i) => `${INSTITUTIONS[i].short} ${i === "cda" ? units : 2}単位`).join(" · ")} · Commission ${commission}円`}
              expanded={configurationStep === 2}
              complete={
                detailsSaved && !configurationError && !conditionsPending
              }
              disabled={pending || configurationProgress < 2}
              onOpen={() => setConfigurationStep(2)}
            >
              {conditionSection}
              {configurationStep === 2 && error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </StudySetupStep>
          </div>
        </StudyDetailDialog>
      )}
    </div>
  );
}
