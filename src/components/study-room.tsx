"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Clock3,
  LockKeyhole,
  UsersRound,
  Wifi,
  WifiOff,
  Copy,
} from "lucide-react";
import { Header } from "./shell";
import { StudyDetailDialog } from "./study-detail-dialog";
import { ExportDownloads } from "./export-downloads";
import { StudyMarketOverview } from "./study-market-overview";
import { StudyMarketHistory } from "./study-market-history";
import { StudyOrderBook } from "./study-order-book";
import { StudyRoster, StudyWaitingRoom } from "./study-lobby";
import {
  StudyPersonalHistory,
  StudyTradeFeedback,
} from "./study-personal-trades";
import { PriceChart } from "./price-chart";
import { ConfirmDialog } from "./confirm-dialog";
import { StudySettingsEditor } from "./study-settings";
import { StudyTimingEditor } from "./study-timing-settings";
import { studyCommission, studyUnitProfit } from "@/lib/study-commission";
import {
  studyTiming,
  studyCountdownLabel,
  studyRemainingMs,
} from "@/lib/study-timing";
import { decimal, timeLabel } from "@/lib/client";
import { isValidPrice, MAX_PRICE } from "@/lib/price";
import { INSTITUTIONS } from "@/lib/study-rules";
import {
  studyMarketSize,
  studyUnits,
  studyInstitutions,
  studyPeriodAt,
  studyPeriodCount,
  studyPeriodRanges,
} from "@/lib/study-config";
import type {
  Institution,
  StudyMarketView,
  StudyStage,
} from "@/lib/study-types";
import type { Command, RoomView } from "@/lib/types";
import { teacherSetupHref } from "@/lib/room-navigation";

type Props = {
  view: RoomView;
  now: number;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
  connected: boolean;
  error: string;
  notice: string;
  retry: () => void;
  demo?: boolean;
  toolbar?: ReactNode;
};
type MarketProps = {
  view: RoomView;
  market: StudyMarketView;
  command: Props["command"];
  disabled: boolean;
};
const stages: Record<StudyStage, string> = {
  waiting: "開始待ち",
  countdown: "開始カウントダウン",
  cda: "連続取引",
  call: "注文受付・清算待ち",
  offer: "売り手の価格提示",
  purchase: "買い手の取引",
  feedback: "取引結果の確認",
  done: "実験終了",
};
const money = (n: number | null | undefined) => `${decimal(n)} 円`;

export function StudyRoom({
  view,
  now,
  command,
  disabled,
  connected,
  error,
  notice,
  retry,
  demo = false,
  toolbar,
}: Props) {
  const study = view.study!,
    teacher = study.teacher;
  const [selected, setSelected] = useState(1);
  const [teacherPriceScope, setTeacherPriceScope] = useState<
    Institution | "all"
  >("all");
  const sourceMarket =
    teacher?.markets.find((m) => m.id === selected) ?? study.market;
  const institutionRange = studyPeriodAt(
    view.config,
    sourceMarket.order,
    sourceMarket.round,
  );
  const institutionStart = institutionRange.first;
  // Scope student displays without changing the stored experiment or teacher data.
  const market = teacher
    ? sourceMarket
    : {
        ...sourceMarket,
        trades: sourceMarket.trades.filter(
          (trade) => trade.institution === sourceMarket.institution,
        ),
        orderHistory: sourceMarket.orderHistory.filter(
          (order) =>
            order.round >= institutionStart &&
            order.round <= institutionRange.last,
        ),
        offerHistory: (sourceMarket.offerHistory ?? []).filter(
          (offer) =>
            offer.round >= institutionStart &&
            offer.round <= institutionRange.last,
        ),
        clearings: sourceMarket.clearings.filter(
          (clearing) =>
            clearing.round >= institutionStart &&
            clearing.round <= institutionRange.last,
        ),
      };
  const priceScope = teacher ? teacherPriceScope : market.institution;
  const priceTrades =
    priceScope === "all"
      ? market.trades
      : market.trades.filter((trade) => trade.institution === priceScope);
  const priceStart =
    priceScope === "all"
      ? 1
      : studyPeriodRanges(view.config, market.order).find(
          (range) => range.institution === priceScope,
        )!.first;
  const pricePeriods =
    priceScope === "all"
      ? view.config.rounds
      : studyPeriodCount(view.config, priceScope);
  const priceScopeLabel =
    priceScope === "all"
      ? `全${view.config.rounds}期`
      : INSTITUTIONS[priceScope].short;
  const cdaLayout = !teacher && market.institution === "cda";
  const callLayout = !teacher && market.institution === "call";
  const postedLayout = !teacher && market.institution === "posted";
  const remaining = studyRemainingMs(view.phase, market, now);
  const seconds = Math.ceil(remaining / 1000);
  const stageLabel =
    view.phase === "finished" || market.stage === "done"
      ? "実験終了"
      : view.phase === "paused"
        ? "一時停止中"
        : market.stage === "purchase" && market.posted
          ? "全買い手の取引時間"
          : stages[market.stage];
  const blocked =
    disabled ||
    view.phase !== "running" ||
    remaining <= 0 ||
    ["done", "waiting", "countdown", "feedback"].includes(market.stage);
  const roomStatus = !demo ? (
    <>
      <span className={`connection ${connected ? "" : "disconnected"}`}>
        {connected ? <Wifi size={14} /> : <WifiOff size={14} />}{" "}
        {connected ? "接続中" : "再接続中"}
      </span>
      <span className="header-room-code">
        ルーム <b>{view.code}</b>
      </span>
      <span className={`role-tag ${teacher ? "teacher" : view.me.role}`}>
        {teacher ? "教員" : view.me.role === "buyer" ? "買い手" : "売り手"}
      </span>
    </>
  ) : null;
  if (!teacher && study.lobby && view.phase === "waiting")
    return (
      <StudyWaitingRoom
        view={view}
        connected={connected}
        retry={retry}
        toolbar={toolbar}
        demo={demo}
        error={error}
      />
    );
  return (
    <div
      className={`study-shell ${demo ? "study-demo" : ""} ${teacher && study.lobby && view.phase === "waiting" ? "study-lobby-shell" : ""}`}
    >
      {!teacher && (
        <StudyTradeFeedback
          key={`${view.code}-${view.me.id}`}
          trades={study.myTradeNotifications ?? study.myTrades}
          buyer={view.me.role === "buyer"}
          feedbackRound={market.stage === "feedback" ? market.round : null}
          feedbackPeriod={market.institutionPeriod}
        />
      )}
      {teacher && (
        <Header homeHref={demo ? "/demo" : teacherSetupHref(view.code)}>
          {!demo && (
            <Link className="text-button" href={teacherSetupHref(view.code)}>
              教員の管理・設定へ
            </Link>
          )}
          {roomStatus}
        </Header>
      )}
      <main className="room-main study-main">
        {toolbar}
        <div
          className={`room-heading study-room-context ${teacher ? "" : "study-student-context"}`}
        >
          {teacher && (
            <div className="study-room-title">
              <div className="eyebrow">教員用ダッシュボード</div>
              <h1>{view.config.title}</h1>
            </div>
          )}
          {!(teacher && study.lobby && view.phase === "waiting") && (
            <section className="study-institution">
              <Image
                src="/fruits/apple.jpg"
                alt="取引する商品：りんご"
                width={44}
                height={44}
              />
              <div>
                <span className="eyebrow">
                  市場{market.id} · 制度内 第{market.institutionPeriod} /{" "}
                  {institutionRange.periods}期
                </span>
                <h2>
                  {INSTITUTIONS[market.institution].short}{" "}
                  <small>{INSTITUTIONS[market.institution].name}</small>
                </h2>
                {market.institution === "posted" && !market.posted && (
                  <p>
                    {view.config.studyPostedMechanism === "batch-bids-v1"
                      ? INSTITUTIONS.posted.description
                      : "旧ルーム：買い手が順番に購入します。"}
                  </p>
                )}
              </div>
            </section>
          )}
          {!teacher && (
            <div className="round-display">
              <div>
                <span className="phase-label">{stageLabel}</span>
                <strong>
                  第 <b>{market.round || "—"}</b> 期{" "}
                  <small>/ {view.config.rounds}</small>
                </strong>
              </div>
              <span className="vertical-line" />
              <div className="timer">
                <span>
                  <Clock3 size={13} />
                  {studyCountdownLabel(market, view.config.rounds)}
                </span>
                <b>{`${Math.floor(seconds / 60)
                  .toString()
                  .padStart(
                    2,
                    "0",
                  )}:${(seconds % 60).toString().padStart(2, "0")}`}</b>
              </div>
            </div>
          )}
        </div>
        {view.mode === "local" && !demo && (
          <p className="local-banner">ローカル環境での実験</p>
        )}
        {!connected && (
          <div className="error-message" role="status">
            再接続しています。取引操作は一時的に停止中です。
            <button className="text-button" onClick={retry}>
              再接続
            </button>
          </div>
        )}
        <div className="feedback-area" aria-live="polite">
          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : notice ? (
            <p className="success-message">{notice}</p>
          ) : null}
        </div>
        {teacher && !demo && (
          <TeacherControls view={view} command={command} disabled={disabled} />
        )}
        {teacher && study.lobby && (
          <StudyRoster view={view} command={command} disabled={disabled} />
        )}
        {teacher && (
          <div className="study-teacher-tools">
            {!demo && (
              <StudyDetailDialog
                label="データをダウンロード（CSV・JSON）"
                title="実験データを保存"
              >
                <p>
                  ルーム {view.code} の全市場・全{view.config.rounds}
                  期が対象です。CSVはExcelで開けます。
                </p>
                <ExportDownloads code={view.code} />
              </StudyDetailDialog>
            )}
            <StudyDetailDialog
              label={`市場${market.id}の注文・清算`}
              title={`市場${market.id}・第${market.round || 1}期の注文・清算`}
            >
              <MarketActivity
                view={view}
                market={market}
                command={command}
                disabled
              />
            </StudyDetailDialog>
            {teacher && (
              <StudyDetailDialog label="市場と制度の順序">
                <section className="panel study-section">
                  <div className="study-section-heading">
                    <h2>市場と制度の順序</h2>
                    <label className="field">
                      表示する市場
                      <select
                        value={market.id}
                        onChange={(e) => setSelected(Number(e.target.value))}
                      >
                        {teacher.markets.map((m) => (
                          <option key={m.id} value={m.id}>
                            市場 {m.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="study-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>市場</th>
                          <th>人数</th>
                          {studyInstitutions(view.config).map(
                            (institution, index) => (
                              <th key={institution}>制度{index + 1}</th>
                            ),
                          )}
                          <th>現在</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teacher.markets.map((m) => (
                          <tr
                            key={m.id}
                            className={m.id === market.id ? "selected-row" : ""}
                          >
                            <td>市場{m.id}</td>
                            <td>
                              {m.participantCount}/
                              {studyMarketSize(view.config)}
                            </td>
                            {studyPeriodRanges(view.config, m.order).map(
                              (range) => (
                                <td key={range.institution}>
                                  {INSTITUTIONS[range.institution].short}
                                  <small>
                                    第{range.first}〜{range.last}期
                                  </small>
                                </td>
                              ),
                            )}
                            <td>{stages[m.stage]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </StudyDetailDialog>
            )}
            {teacher && (
              <StudyDetailDialog
                label="集計・条件・参加者"
                title="市場の集計と実験管理"
              >
                <StudyTimingEditor
                  view={view}
                  command={command}
                  disabled={disabled}
                />
                <TeacherMetrics view={view} market={market} />
                <StudySettingsEditor
                  view={view}
                  command={command}
                  disabled={disabled}
                />
                <section className="panel study-section">
                  <h2>市場{market.id}の参加者と条件（買い手・売り手）</h2>
                  <div className="study-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>市場</th>
                          <th>名前</th>
                          <th>役割</th>
                          {Array.from(
                            {
                              length: studyUnits(
                                view.config,
                                market.institution,
                              ),
                            },
                            (_, unit) => (
                              <th key={unit}>第{unit + 1}単位</th>
                            ),
                          )}
                          <th>累積利益</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teacher.participants
                          .filter((p) => p.market === market.id)
                          .map((p) => (
                            <tr key={p.id}>
                              <td>{p.market}</td>
                              <td>{p.nickname}</td>
                              <td>{p.alias}</td>
                              {p.limits.map((value, unit) => (
                                <td key={unit}>{money(value)}</td>
                              ))}
                              <td>{money(p.profit)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </StudyDetailDialog>
            )}
          </div>
        )}
        {!teacher &&
          !demo &&
          (view.phase !== "running" ||
            ["waiting", "done"].includes(market.stage)) && (
            <div className="phase-banner">
              <Clock3 size={19} />
              <div>
                <b>
                  {view.phase === "finished" || market.stage === "done"
                    ? "おつかれさまでした。実験は終了です"
                    : view.phase === "waiting"
                      ? "教員が実験を開始するまでお待ちください"
                      : view.phase === "paused"
                        ? "取引は一時停止中です"
                        : "この市場の参加者を待っています"}
                </b>
                <p>
                  {view.phase === "finished" || market.stage === "done"
                    ? `累積利益は ${money(view.me.profit)} です。`
                    : view.phase === "paused"
                      ? "教員が再開するまでお待ちください。残り時間は止まっています。"
                      : `この市場は ${market.participantCount} / ${studyMarketSize(view.config)}人が入室しています。教員が実験を開始し、${studyMarketSize(view.config)}人そろうと自動で始まります。`}
                </p>
              </div>
            </div>
          )}
        {!(teacher && study.lobby && view.phase === "waiting") && (
          <div
            className={`study-trading-grid ${teacher ? "teacher-layout" : ""} ${cdaLayout ? "cda-layout" : ""} ${callLayout ? "call-layout" : ""} ${postedLayout ? "posted-layout" : ""}`}
          >
            <div className="study-market-column">
              {teacher ? (
                <StudyMarketOverview
                  key={view.code}
                  teacher={teacher}
                  config={view.config}
                  phase={view.phase}
                  now={now}
                  selected={market.id}
                  onSelect={setSelected}
                  demo={demo}
                />
              ) : (
                <MarketActivity
                  view={view}
                  market={market}
                  command={command}
                  disabled={blocked}
                />
              )}
            </div>
            {!teacher && (
              <StudyMarketHistory
                key={`${market.id}-${market.institution}`}
                trades={market.trades}
                orders={market.orderHistory}
                clearings={market.clearings}
                offerHistory={market.offerHistory}
                participantId={view.me.id}
                institution={market.institution}
                firstPeriod={institutionStart}
                institutionPeriods={institutionRange.periods}
                rounds={view.config.rounds}
                standalone
              />
            )}
            {!teacher && (
              <StudyPersonalHistory
                key={`${view.code}-${view.me.id}-${market.institution}`}
                trades={study.myTrades.filter(
                  (trade) => trade.institution === market.institution,
                )}
                firstPeriod={institutionStart}
              />
            )}
            {!teacher && (
              <StudentConditions
                view={view}
                market={market}
                command={command}
                disabled={blocked}
              />
            )}
            <section className="panel study-section study-price-panel">
              {!teacher && !demo && (
                <div className="study-price-status">{roomStatus}</div>
              )}
              <h2>
                {teacher
                  ? `市場${market.id}・${priceScopeLabel}の取引価格`
                  : "取引価格"}
              </h2>
              {teacher && (
                <label className="field study-price-scope">
                  表示範囲
                  <select
                    aria-label="価格履歴の表示範囲"
                    value={teacherPriceScope}
                    onChange={(event) =>
                      setTeacherPriceScope(
                        event.target.value as Institution | "all",
                      )
                    }
                  >
                    <option value="all">全{view.config.rounds}期</option>
                    {market.order.map((institution) => (
                      <option key={institution} value={institution}>
                        {INSTITUTIONS[institution].short}・制度内1〜
                        {studyPeriodCount(view.config, institution)}期
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <PriceChart
                trades={priceTrades.map((trade) => ({
                  ...trade,
                  good: "apple",
                  round: trade.round - priceStart + 1,
                }))}
                rounds={pricePeriods}
                ariaLabel={`${priceScopeLabel}の取引価格（円）を${priceScope === "all" ? `全体の第1〜${view.config.rounds}期` : `制度内の第1〜${pricePeriods}期`}で表示したグラフ${teacher ? "。色付きの帯は理論上の均衡価格区間です。" : ""}`}
                periodAxis
                fill
                equilibrium={teacher?.equilibrium}
              />
              <StudyDetailDialog
                key={`${market.id}-${priceScope}`}
                label={`${priceScopeLabel}の取引履歴（${priceTrades.length}件）`}
                title={`市場${market.id}・${priceScopeLabel}の取引履歴`}
              >
                <div className="study-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          {priceScope === "all" ? "全体の期" : "制度内の期"}
                        </th>
                        <th>制度</th>
                        <th>時刻</th>
                        <th>価格</th>
                        <th>買い手</th>
                        <th>売り手</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceTrades.map((t) => (
                        <tr key={t.id}>
                          <td title={`全体の第${t.round}期`}>
                            {t.round - priceStart + 1}
                          </td>
                          <td>{INSTITUTIONS[t.institution].short}</td>
                          <td>{timeLabel(t.at)}</td>
                          <td>{money(t.price)}</td>
                          <td>{t.buyerAlias}</td>
                          <td>{t.sellerAlias}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </StudyDetailDialog>
              {!teacher && (
                <div className="study-personal-results">
                  <div className="study-profit">
                    <span>
                      今期の利益{" "}
                      <b className={view.me.roundProfit < 0 ? "loss" : ""}>
                        {money(view.me.roundProfit)}
                      </b>
                    </span>
                    <span>
                      累積利益{" "}
                      <b className={view.me.profit < 0 ? "loss" : ""}>
                        {money(view.me.profit)}
                      </b>
                    </span>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
        {!teacher && market.stage === "countdown" && (
          <div
            className="study-start-countdown"
            role="status"
            aria-live="polite"
          >
            <div className="panel">
              <span className="eyebrow">
                市場{market.id} ·{" "}
                {view.me.role === "buyer" ? "買い手" : "売り手"}
              </span>
              <h2>
                {view.phase === "paused"
                  ? "開始前に一時停止しています"
                  : "まもなく実験が始まります"}
              </h2>
              <strong>{seconds || "開始中"}</strong>
              <p>
                {view.phase === "paused"
                  ? "教員が再開するまでお待ちください。"
                  : "あなたの条件を確認してください。カウントダウン後に注文できます。"}
              </p>
            </div>
          </div>
        )}
        {!demo && (
          <p className="room-bottom-note">注文・約定は自動で同期されます。</p>
        )}
      </main>
    </div>
  );
}

function StudentConditions(props: MarketProps) {
  const { view, market } = props;
  const study = view.study!;
  return (
    <aside
      className={`panel study-section private-panel ${market.institution === "posted" && view.me.role === "buyer" ? "study-purchase-conditions" : ""}`}
    >
      <h2>
        <LockKeyhole size={16} /> {view.me.nickname}の条件
        <span className={`role-tag ${view.me.role} study-conditions-role`}>
          {view.me.role === "buyer" ? "買い手" : "売り手"}
        </span>
      </h2>
      <div className="study-private-values">
        <p>
          {view.me.role === "buyer"
            ? "購入する単位ごとの価値"
            : "販売する単位ごとの費用"}
        </p>
        <p className="study-commission-note">
          Commission {money(studyCommission(view.config))}／単位
          <span>成立時に加算・表示利益に含む</span>
        </p>
        <div
          className={`study-values ${market.institution === "cda" ? "study-current-value" : ""}`}
          aria-live={market.institution === "cda" ? "polite" : undefined}
        >
          {study.unitLimits!.map((v, i) =>
            market.institution !== "cda" || i === study.unitsUsed ? (
              <div key={i} className={i < study.unitsUsed ? "used-unit" : ""}>
                <span>
                  {i + 1}単位目{i < study.unitsUsed ? "・取引済み" : ""}
                  {market.institution === "cda" &&
                    ` / ${studyUnits(view.config)}単位`}
                </span>
                <b>{money(v)}</b>
              </div>
            ) : null,
          )}
        </div>
      </div>
      <div className="study-private-order">
        <StudentOrder
          key={`${market.round}-${market.stageKey}-${study.unitsUsed}`}
          {...props}
        />
      </div>
    </aside>
  );
}

function MarketActivity(props: MarketProps) {
  const { market, view } = props;
  if (market.institution === "cda") return <StudyOrderBook {...props} />;
  if (market.institution === "posted") return <OfferBoard {...props} />;
  return (
    <StudyOrderBook
      view={view}
      market={market}
      title={`一括約定・第${market.call || 1}回 / 4回`}
    >
      <p className="muted">
        注文板に価格と残数量を公開します。取引は清算時刻にまとめて成立します。未約定注文は各回で失効し、残り数量を次の回で再注文できます。未送信の場合は注文なしとして進みます。
      </p>
      <p className="field-help study-call-guidance">
        送信は各回1回です。
        {view.study!.teacher
          ? "2単位目の買値は1単位目以下、売値は1単位目以上にしてください。"
          : view.me.role === "buyer"
            ? "2単位目の買値は1単位目以下にしてください。"
            : "2単位目の売値は1単位目以上にしてください。"}
        実際の利益は清算価格で決まります。
      </p>
    </StudyOrderBook>
  );
}

function TeacherControls({
  view,
  command,
  disabled,
}: {
  view: RoomView;
  command: Props["command"];
  disabled: boolean;
}) {
  const [confirm, setConfirm] = useState<"finish" | "end-round" | null>(null),
    [copied, setCopied] = useState(false);
  return (
    <section className="panel study-section study-teacher-controls">
      <div className="study-section-heading">
        <div>
          <span className="eyebrow">学生用ルームコード</span>
          <b className="study-code">{view.code}</b>
        </div>
        <span>
          <UsersRound size={16} /> {view.participantCount} /{" "}
          {view.config.capacity} 人
        </span>
      </div>
      <div className="study-actions">
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${location.origin}/?code=${view.code}`,
              );
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Copy size={15} />
          {copied ? "コピーしました" : "参加リンクをコピー"}
        </button>
        {["waiting", "review"].includes(view.phase) && (
          <button
            className="button primary"
            disabled={
              disabled ||
              Boolean(
                view.study?.lobby &&
                (view.participantCount !== view.config.capacity ||
                  view.study.lobby.randomizedAt === null),
              )
            }
            onClick={() => void command({ type: "start" })}
          >
            実験を開始
          </button>
        )}
        {view.phase === "running" && (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => void command({ type: "pause" })}
          >
            全市場を一時停止
          </button>
        )}
        {view.phase === "paused" && (
          <button
            className="button primary"
            disabled={disabled}
            onClick={() => void command({ type: "resume" })}
          >
            全市場を再開
          </button>
        )}
        {["running", "paused"].includes(view.phase) && (
          <button
            className="button secondary"
            disabled={
              disabled ||
              !view.study!.teacher!.markets.some(
                (m) =>
                  !["done", "waiting", "countdown", "feedback"].includes(
                    m.stage,
                  ),
              )
            }
            onClick={() => setConfirm("end-round")}
          >
            各市場の今期を終了
          </button>
        )}
        {view.phase !== "finished" && (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => setConfirm("finish")}
          >
            実験を終了
          </button>
        )}
      </div>
      <p className="field-help">
        {view.study?.lobby
          ? "全員の入室とランダム割り当てを確認して開始します。全市場で5秒後に取引が始まります。"
          : `実験を開始すると、各市場は${studyMarketSize(view.config)}人そろい次第、取引を開始します。`}
        各期の終了後は自動で次の期へ進みます。制度の最終期は8秒間の結果確認後に進み、
        {view.config.rounds}期で終了します。
      </p>
      {confirm && (
        <ConfirmDialog
          title={
            confirm === "finish"
              ? "実験を終了しますか？"
              : "各市場の進行中の期を終了しますか？"
          }
          message={
            confirm === "finish"
              ? "すべての市場を終了します。受付中の注文は取り消され、未完了の期は「途中終了」として記録されます。"
              : "各市場の進行中の期を「途中終了」として記録し、次の期へ進みます。一時停止中は次の期も停止したままです。Callの未清算注文は約定しません。"
          }
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await command({ type: confirm });
            setConfirm(null);
          }}
        />
      )}
    </section>
  );
}

function OfferBoard({ view, market, command, disabled }: MarketProps) {
  if (view.config.studyPostedMechanism === "batch-bids-v1")
    return (
      <StudyOrderBook view={view} market={market}>
        <p className="muted">
          {market.stage === "offer"
            ? "価格提示の締切後、売り注文を公開し、すべての買い手が買い注文を送信できます。"
            : "1秒ごとに高い買値・安い売値から約定します。同じ買値は抽選、同じ売値は提示順。取引価格は売り手の提示価格です。"}
        </p>
      </StudyOrderBook>
    );
  return (
    <LegacyOfferBoard
      view={view}
      market={market}
      command={command}
      disabled={disabled}
    />
  );
}

function LegacyOfferBoard({ view, market, command, disabled }: MarketProps) {
  const mine = market.activeBuyer === view.me.alias && view.me.role === "buyer";
  const timing = studyTiming(view.config);
  const myTurn = market.stage === "purchase" && mine;
  const sortedOffers = [...market.offers].sort((a, b) => a.price - b.price);
  return (
    <section className="panel study-section study-offers study-market-workspace">
      <div className="study-offer-heading">
        <h2>売り手の提示価格</h2>
        {market.stage === "purchase" && (
          <span
            className={`study-offer-buyer-label ${myTurn ? "is-my-turn" : ""}`}
            role="status"
          >
            {myTurn
              ? `あなたの番：${timing.buyerSeconds}秒以内に購入数を選択`
              : view.me.role === "buyer"
                ? "自分の番までお待ちください。"
                : `現在は ${market.activeBuyer} の購入時間です。`}
          </span>
        )}
      </div>
      {market.stage === "offer" ? (
        <p className="study-empty">
          {timing.offerSeconds}
          秒の提示時間が終わると、全売り手の価格と在庫が公開されます。
        </p>
      ) : (
        <>
          <div className="study-offer-content">
            <div className="study-offer-list" aria-label="売り手の提示一覧">
              {sortedOffers.map((o) => (
                <div className="study-offer-card" key={o.id}>
                  <div className="study-offer-info">
                    <b>{money(o.price)}</b>
                  </div>
                  <div className="study-offer-actions">
                    {[1, 2]
                      .filter(
                        (q) =>
                          q <= Math.min(o.remaining, 2 - view.study!.unitsUsed),
                      )
                      .map((q) => (
                        <button
                          key={q}
                          className="button secondary study-buy-button"
                          disabled={disabled || !mine}
                          onClick={() =>
                            void command({
                              type: "posted-buy",
                              offerId: o.id,
                              quantity: q,
                            })
                          }
                        >
                          {q}単位購入
                          {view.me.role === "buyer" && (
                            <ExpectedProfit
                              view={view}
                              price={o.price}
                              quantity={q}
                            />
                          )}
                        </button>
                      ))}
                    {o.remaining === 0 && (
                      <span className="muted">売り切れ</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!market.offers.length && (
              <p className="study-empty">購入可能な在庫はありません。</p>
            )}
          </div>
          {market.stage !== "purchase" && (
            <div className="study-offer-status" role="status">
              <strong>
                {view.phase === "waiting"
                  ? "実験開始をお待ちください"
                  : "今期の購入時間は終了しました。"}
              </strong>
            </div>
          )}
        </>
      )}
      {view.study!.teacher && (
        <StudyMarketHistory
          key={market.id}
          trades={market.trades}
          orders={market.orderHistory}
          clearings={market.clearings}
          offerHistory={market.offerHistory}
          rounds={view.config.rounds}
          showParticipants
        />
      )}
    </section>
  );
}

function StudentOrder(props: MarketProps) {
  if (
    props.view.config.studyPostedMechanism === "batch-bids-v1" &&
    props.market.institution === "posted" &&
    props.view.me.role === "buyer"
  )
    return <PostedBidForm {...props} />;
  return <ExistingStudentOrder {...props} />;
}

function PostedBidForm({ view, market, command, disabled }: MarketProps) {
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const mine =
    market.posted?.bids.filter((bid) => bid.participantId === view.me.id) ?? [];
  const reserved = mine.reduce((sum, bid) => sum + bid.remaining, 0);
  const available = 2 - view.study!.unitsUsed - reserved;
  return (
    <div className="study-order-form">
      {mine.length > 0 && (
        <p role="status">
          注文受付済み：
          {mine
            .map((bid) => `${bid.price}円 × 残${bid.remaining}単位`)
            .join("、")}
          。変更・取消はできません。
        </p>
      )}
      {available > 0 ? (
        <form
          className="study-order-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (disabled || market.stage !== "purchase") return;
            if (!isValidPrice(Number(price))) {
              setError(`買値は1〜${MAX_PRICE}円の整数で入力してください。`);
              return;
            }
            setError("");
            if (
              await command({
                type: "posted-bid",
                price: Number(price),
                quantity: Math.min(quantity, available),
              })
            )
              setPrice("");
          }}
        >
          <label className="field">
            買いたい価格（円）
            <input
              type="number"
              min="1"
              max={MAX_PRICE}
              step="1"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              disabled={disabled || market.stage !== "purchase"}
            />
          </label>
          <label className="field">
            今回注文する数量
            <select
              value={Math.min(quantity, available)}
              onChange={(event) => setQuantity(Number(event.target.value))}
              disabled={disabled || market.stage !== "purchase"}
            >
              {Array.from({ length: available }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}単位
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary full"
            disabled={disabled || market.stage !== "purchase"}
          >
            買い注文を出す
          </button>
        </form>
      ) : (
        !reserved && (
          <p className="success-message">今期の2単位の取引は完了しました。</p>
        )
      )}
    </div>
  );
}

function ExistingStudentOrder({
  view,
  market,
  command,
  disabled,
}: MarketProps) {
  const [price, setPrice] = useState(""),
    [second, setSecond] = useState(""),
    [quantity, setQuantity] = useState(
      studyUnits(view.config, market.institution) - view.study!.unitsUsed,
    ),
    [validation, setValidation] = useState("");
  const study = view.study!,
    buyer = view.me.role === "buyer",
    remaining = studyUnits(view.config, market.institution) - study.unitsUsed;
  const priceInput = useRef<HTMLInputElement>(null);
  const focusNextUnit = useRef(
    market.institution === "cda" && study.unitsUsed > 0 && remaining > 0,
  );
  const formDisabled =
    disabled || (market.institution === "posted" && market.stage !== "offer");
  useEffect(() => {
    // Every CDA fill resets this keyed form. Focus the next available unit.
    if (focusNextUnit.current && !formDisabled && priceInput.current) {
      priceInput.current.focus({ preventScroll: true });
      focusNextUnit.current = false;
    }
  }, [formDisabled]);
  const best =
    market.institution === "cda"
      ? market.orders
          .filter((order) => order.side !== view.me.role)
          .sort(
            (a, b) =>
              (buyer ? a.price - b.price : b.price - a.price) ||
              a.sequence - b.sequence,
          )[0]
      : undefined;
  const expected =
    quantity > 0 &&
    price &&
    !(market.institution === "call" && quantity === 2 && !second)
      ? study
          .unitLimits!.slice(
            study.unitsUsed,
            study.unitsUsed + (market.institution === "cda" ? 1 : quantity),
          )
          .reduce((sum, v, i) => {
            const p =
              market.institution === "call" && i === 1
                ? Number(second)
                : Number(price);
            return (
              sum +
              studyUnitProfit(
                buyer ? "buyer" : "seller",
                v,
                p,
                studyCommission(view.config),
              )
            );
          }, 0)
      : null;
  if (!remaining)
    return (
      <p className="success-message">
        今期の{studyUnits(view.config, market.institution)}
        単位の取引は完了しました。
      </p>
    );
  if (market.institution === "posted" && buyer)
    return (
      <p className="callout">
        購入順は毎期ランダムに決まります。自分の番になったら、提示一覧から購入してください。
      </p>
    );
  if (market.institution !== "cda" && market.submitted)
    return (
      <p className="success-message">
        送信済みです。
        {market.myOffer
          ? market.myOffer.quantity === 0
            ? "出品なし。"
            : `${market.myOffer.price}円・${market.myOffer.quantity}単位。`
          : market.myOrders.length
            ? market.myOrders
                .map((o) => `${o.unit}単位目：${o.price}円`)
                .join("、")
            : "今回は注文していません。"}
        {market.institution === "call"
          ? "この回の選択は変更できません。"
          : "この提示は変更できません。"}
      </p>
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidation("");
    if (formDisabled) return;
    const prices =
      market.institution === "call" && quantity === 2
        ? [Number(price), Number(second)]
        : [Number(price)];
    if (prices.some((p) => !isValidPrice(p))) {
      setValidation(`注文価格は1〜${MAX_PRICE}円の整数で入力してください。`);
      return;
    }
    const accepted = await command(
      market.institution === "cda"
        ? { type: "study-quote", price: Number(price) }
        : market.institution === "call"
          ? { type: "call-submit", prices }
          : { type: "posted-offer", price: Number(price), quantity },
    );
    if (accepted) {
      setPrice("");
      setSecond("");
    }
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className={`study-order-form ${market.institution === "call" ? "study-call-form" : ""}`}
    >
      {market.institution !== "cda" && (
        <label className="field">
          {market.institution === "call" ? "今回注文する数量" : "提示する数量"}
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            disabled={formDisabled}
          >
            {Array.from({ length: remaining }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}単位
              </option>
            ))}
          </select>
        </label>
      )}
      <label
        className={`field ${market.institution === "call" ? "study-call-price" : ""}`}
      >
        {market.institution === "posted"
          ? "1単位あたりの販売価格"
          : market.institution === "call"
            ? `${study.unitsUsed + 1}単位目の${buyer ? "買値" : "売値"}`
            : `${study.unitsUsed + 1}単位目の${buyer ? "買いたい" : "売りたい"}価格`}
        <div className="study-price-input">
          <input
            ref={priceInput}
            type="number"
            min={1}
            max={MAX_PRICE}
            step={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            disabled={formDisabled}
          />
          <span>円</span>
        </div>
      </label>
      {market.institution === "call" && quantity === 2 && (
        <label className="field study-call-price">
          2単位目の{buyer ? "買値" : "売値"}
          <div className="study-price-input">
            <input
              type="number"
              min={1}
              max={MAX_PRICE}
              step={1}
              value={second}
              onChange={(e) => setSecond(e.target.value)}
              required
              disabled={formDisabled}
            />
            <span>円</span>
          </div>
        </label>
      )}
      <p
        className={
          expected !== null && expected < 0 ? "study-loss" : "field-help"
        }
      >
        {market.institution === "call"
          ? "入力価格で成立した場合の利益"
          : "この提示価格での利益"}
        ：{money(expected)}（Commission込み）
      </p>
      {market.institution === "posted" && (
        <p className="field-help">
          締切までに確定しなければ、今期は出品しません。
        </p>
      )}
      {validation && (
        <p role="alert" className="error-message">
          {validation}
        </p>
      )}
      {market.institution === "cda" ? (
        <div className="study-cda-order-actions">
          <button
            type="submit"
            className="button primary full"
            disabled={formDisabled}
          >
            指値注文
          </button>
          <div className="study-market-order">
            <button
              type="button"
              className="button primary full"
              disabled={formDisabled || !best}
              onClick={() => {
                if (best)
                  void command({ type: "study-accept", orderId: best.id });
              }}
            >
              成行注文
            </button>
            {best && (
              <ExpectedProfit view={view} price={best.price} quantity={1} />
            )}
          </div>
        </div>
      ) : (
        <button className="button primary full" disabled={formDisabled}>
          {market.institution === "call"
            ? "今回の注文を確定"
            : "価格と数量を確定"}
        </button>
      )}
    </form>
  );
}

function ExpectedProfit({
  view,
  price,
  quantity,
}: {
  view: RoomView;
  price: number;
  quantity: number;
}) {
  const study = view.study!;
  if (
    !study.unitLimits ||
    study.unitsUsed + quantity >
      studyUnits(view.config, study.market.institution)
  )
    return null;
  const profit = study.unitLimits
    .slice(study.unitsUsed, study.unitsUsed + quantity)
    .reduce(
      (sum, value) =>
        sum +
        studyUnitProfit(
          view.me.role === "buyer" ? "buyer" : "seller",
          value,
          price,
          studyCommission(view.config),
        ),
      0,
    );
  return (
    <small className={profit < 0 ? "loss" : "field-help"}>
      利益 {money(profit)}
    </small>
  );
}

function TeacherMetrics({
  view,
  market,
}: {
  view: RoomView;
  market: StudyMarketView;
}) {
  const teacher = view.study!.teacher!,
    eq = teacher.equilibria?.[market.institution] ?? teacher.equilibrium;
  return (
    <section className="panel study-section">
      <h2>市場{market.id}の価格・数量・効率性</h2>
      <p className="muted">
        均衡価格{" "}
        {eq.low === eq.high ? money(eq.low) : `${eq.low}〜${eq.high}円`} ／
        正余剰の数量 {eq.quantity}、ゼロ余剰を含む上限 {eq.quantityMax} ／
        最大総余剰 {money(eq.surplus)}
      </p>
      <p className="field-help">
        個人利益はCommission込みです。総余剰・効率性・均衡の計算にはCommissionを含めません。
      </p>
      <div className="study-table-wrap">
        <table>
          <thead>
            <tr>
              <th>期</th>
              <th>制度</th>
              <th>状態</th>
              <th>数量</th>
              <th>Q/Q*</th>
              <th>平均価格</th>
              <th>価格偏離</th>
              <th>Smith α</th>
              <th>総余剰</th>
              <th>Commission支給総額</th>
              <th>効率</th>
              <th>非効率取引</th>
              <th>平均気配差</th>
            </tr>
          </thead>
          <tbody>
            {teacher.metrics
              .filter((m) => m.market === market.id)
              .map((m) => (
                <tr key={m.round}>
                  <td>{m.round}</td>
                  <td>{INSTITUTIONS[m.institution].short}</td>
                  <td>
                    {m.completion === "complete"
                      ? "完了"
                      : m.completion === "interrupted"
                        ? "途中終了"
                        : "進行中"}
                  </td>
                  <td>{m.quantity}</td>
                  <td>
                    {m.quantityRatio === null
                      ? "—"
                      : m.quantityRatio.toFixed(2)}
                  </td>
                  <td>{decimal(m.mean)}</td>
                  <td>{decimal(m.deviation)}</td>
                  <td>{m.alpha === null ? "—" : m.alpha.toFixed(4)}</td>
                  <td>{decimal(m.surplus)}</td>
                  <td>{decimal(m.commissionPaid)}</td>
                  <td>{decimal(m.efficiency)}%</td>
                  <td>{m.inefficientTrades}</td>
                  <td>{decimal(m.spread)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="field-help">
        αは均衡価格からの二乗平均平方根偏差を均衡価格で割った値です（単純な価格分散ではありません）。Callは4回すべての約定を用います。数量比の分母は正余剰の数量で、ゼロ余剰の取引により1を超える場合があります。気配差は両側に注文がある時間の加重平均です。
      </p>
      <div className="study-actions">
        {teacher.slopes
          .filter((s) => s.market === market.id)
          .map((s) => (
            <p key={s.institution}>
              {INSTITUTIONS[s.institution].short}のα傾き：
              <b>{s.slope === null ? "—" : s.slope.toFixed(4)}</b>（完了した
              {s.n}期）
            </p>
          ))}
      </div>
      <p className="field-help">
        途中終了・取引ゼロの期は傾き計算から除外します。傾きは各制度で設定した期数の記述統計で、有意差検定ではありません。
      </p>
    </section>
  );
}
