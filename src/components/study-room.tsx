"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import {
  Clock3,
  LockKeyhole,
  Download,
  UsersRound,
  Wifi,
  WifiOff,
  Copy,
} from "lucide-react";
import { Header } from "./shell";
import { StudyDetailDialog } from "./study-detail-dialog";
import { StudyMarketOverview } from "./study-market-overview";
import { StudyMarketHistory } from "./study-market-history";
import { StudyRoster, StudyWaitingRoom } from "./study-lobby";
import {
  StudyPersonalHistory,
  StudyTradeFeedback,
} from "./study-personal-trades";
import { PriceChart } from "./price-chart";
import { ConfirmDialog } from "./confirm-dialog";
import { StudySettingsEditor } from "./study-settings";
import { StudyTimingEditor } from "./study-timing-settings";
import { studyTiming } from "@/lib/study-timing";
import { decimal, timeLabel } from "@/lib/client";
import { INSTITUTIONS } from "@/lib/study-rules";
import { studyMarketSize } from "@/lib/study-config";
import type {
  Institution,
  StudyMarketView,
  StudyStage,
} from "@/lib/study-types";
import type { Command, RoomView } from "@/lib/types";

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
  call: "非公開注文の受付",
  offer: "売り手の価格提示",
  purchase: "順番に購入",
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
  const institutionStart =
    sourceMarket.order.indexOf(sourceMarket.institution) * 5 + 1;
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
            order.round < institutionStart + 5,
        ),
        offerHistory: (sourceMarket.offerHistory ?? []).filter(
          (offer) =>
            offer.round >= institutionStart &&
            offer.round < institutionStart + 5,
        ),
        clearings: sourceMarket.clearings.filter(
          (clearing) =>
            clearing.round >= institutionStart &&
            clearing.round < institutionStart + 5,
        ),
      };
  const priceScope = teacher ? teacherPriceScope : market.institution;
  const priceTrades =
    priceScope === "all"
      ? market.trades
      : market.trades.filter((trade) => trade.institution === priceScope);
  const priceStart =
    priceScope === "all" ? 1 : market.order.indexOf(priceScope) * 5 + 1;
  const pricePeriods = priceScope === "all" ? 15 : 5;
  const priceScopeLabel =
    priceScope === "all" ? "全15期" : INSTITUTIONS[priceScope].short;
  const cdaLayout = !teacher && market.institution === "cda";
  const callLayout = !teacher && market.institution === "call";
  const postedLayout = !teacher && market.institution === "posted";
  const integratedLayout = !teacher && market.institution !== "cda";
  const remaining =
    view.phase === "running" && market.deadline !== null
      ? Math.max(0, market.deadline - now)
      : market.remainingMs;
  const seconds = Math.ceil(remaining / 1000);
  const stageLabel =
    view.phase === "finished" || market.stage === "done"
      ? "実験終了"
      : view.phase === "paused"
        ? "一時停止中"
        : stages[market.stage];
  const blocked =
    disabled ||
    view.phase !== "running" ||
    remaining <= 0 ||
    ["done", "waiting", "countdown"].includes(market.stage);
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
          trades={study.myTrades}
          buyer={view.me.role === "buyer"}
        />
      )}
      <Header>
        {demo ? (
          <span className="demo-header-tag">ひとりデモ</span>
        ) : (
          <>
            <span className={`connection ${connected ? "" : "disconnected"}`}>
              {connected ? <Wifi size={14} /> : <WifiOff size={14} />}{" "}
              {connected ? "接続中" : "再接続中"}
            </span>
            <span className="header-room-code">
              ルーム <b>{view.code}</b>
            </span>
          </>
        )}
        <span className={`role-tag ${teacher ? "teacher" : view.me.role}`}>
          {teacher ? "教員" : view.me.role === "buyer" ? "買い手" : "売り手"}
        </span>
      </Header>
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
                  市場{market.id} · 制度内 第{market.institutionPeriod} / 5期
                </span>
                <h2>
                  {INSTITUTIONS[market.institution].short}{" "}
                  <small>{INSTITUTIONS[market.institution].name}</small>
                </h2>
                {market.institution !== "call" && (
                  <p>{INSTITUTIONS[market.institution].description}</p>
                )}
              </div>
            </section>
          )}
          {!teacher && (
            <div className="round-display">
              <div>
                <span className="phase-label">{stageLabel}</span>
                <strong>
                  第 <b>{market.round || "—"}</b> 期 <small>/ 15</small>
                </strong>
              </div>
              <span className="vertical-line" />
              <div className="timer">
                <span>
                  <Clock3 size={13} />
                  この段階の残り時間
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
                          <th>第1〜5期</th>
                          <th>第6〜10期</th>
                          <th>第11〜15期</th>
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
                            {m.order.map((i) => (
                              <td key={i}>{INSTITUTIONS[i].short}</td>
                            ))}
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
                {!demo && (
                  <StudySettingsEditor
                    view={view}
                    command={command}
                    disabled={disabled}
                  />
                )}
                <section className="panel study-section">
                  <h2>市場{market.id}の参加者と条件（買い手・売り手）</h2>
                  <div className="study-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>市場</th>
                          <th>名前</th>
                          <th>役割</th>
                          <th>第1単位</th>
                          <th>第2単位</th>
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
                              <td>{money(p.limits[0])}</td>
                              <td>{money(p.limits[1])}</td>
                              <td>{money(p.profit)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                {!demo && (
                  <section className="panel study-section">
                    <h2>実験データを保存</h2>
                    <p className="muted">
                      すべての市場・15期の記録を、制度・市場番号・単位番号とともに保存します。
                    </p>
                    <div className="study-actions">
                      {[
                        ["trades", "取引履歴 CSV"],
                        ["metrics", "市場・期別集計 CSV"],
                        ["events", "操作ログ CSV"],
                        ["settings", "実験条件 JSON"],
                      ].map(([kind, name]) => (
                        <a
                          className="button secondary"
                          href={`/api/rooms/${view.code}/export?kind=${kind}`}
                          key={kind}
                        >
                          <Download size={15} />
                          {name}
                        </a>
                      ))}
                    </div>
                  </section>
                )}
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
            className={`study-trading-grid ${teacher ? "teacher-layout" : ""} ${cdaLayout ? "cda-layout" : ""} ${integratedLayout ? "integrated-layout" : ""} ${callLayout ? "call-layout" : ""} ${postedLayout ? "posted-layout" : ""}`}
          >
            <div className="study-market-column">
              {teacher ? (
                <StudyMarketOverview
                  key={view.code}
                  teacher={teacher}
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
                >
                  {integratedLayout && (
                    <StudentConditions
                      view={view}
                      market={market}
                      command={command}
                      disabled={blocked}
                      embedded
                    />
                  )}
                </MarketActivity>
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
                standalone
              />
            )}
            {cdaLayout && (
              <StudentConditions
                view={view}
                market={market}
                command={command}
                disabled={blocked}
              />
            )}
            <section className="panel study-section study-price-panel">
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
                    <option value="all">全15期</option>
                    {market.order.map((institution) => (
                      <option key={institution} value={institution}>
                        {INSTITUTIONS[institution].short}・制度内1〜5期
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="muted">
                {priceScope === "all"
                  ? market.order
                      .map(
                        (institution, index) =>
                          `${index * 5 + 1}〜${index * 5 + 5}期：${INSTITUTIONS[institution].short}`,
                      )
                      .join(" ／ ")
                  : `市場${market.id}・${priceScopeLabel}の5期分。横軸は制度内1〜5期（全体の第${priceStart}〜${priceStart + 4}期）です。`}
              </p>
              <PriceChart
                trades={priceTrades.map((trade) => ({
                  ...trade,
                  good: "apple",
                  round: trade.round - priceStart + 1,
                }))}
                rounds={pricePeriods}
                ariaLabel={`${priceScopeLabel}の取引価格（円）を${priceScope === "all" ? "全体の第1〜15期" : "制度内の第1〜5期"}で表示したグラフ${teacher ? "。色付きの帯は理論上の均衡価格区間です。" : ""}`}
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

function StudentConditions({
  embedded = false,
  ...props
}: MarketProps & { embedded?: boolean }) {
  const { view, market } = props;
  const study = view.study!;
  const myTrades = study.myTrades.filter(
    (trade) => trade.institution === market.institution,
  );
  return (
    <aside
      className={
        embedded
          ? `private-panel study-integrated-conditions ${market.institution === "posted" && view.me.role === "buyer" ? "study-purchase-conditions" : ""}`
          : "panel study-section private-panel"
      }
    >
      <h2>
        <LockKeyhole size={16} /> {view.me.nickname}の条件
      </h2>
      <div className="study-private-values">
        <p>
          {view.me.role === "buyer"
            ? "購入する単位ごとの価値"
            : "販売する単位ごとの費用"}
        </p>
        <div className="study-values">
          {study.unitLimits!.map((v, i) => (
            <div key={i} className={i < study.unitsUsed ? "used-unit" : ""}>
              <span>
                {i + 1}単位目{i < study.unitsUsed ? "・取引済み" : ""}
              </span>
              <b>{money(v)}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="study-private-order">
        <StudentOrder
          key={`${market.round}-${market.stageKey}-${study.unitsUsed}`}
          {...props}
        />
      </div>
      <StudyPersonalHistory
        key={`${view.code}-${view.me.id}-${market.institution}`}
        trades={myTrades}
      />
    </aside>
  );
}

function MarketActivity({
  children,
  ...props
}: MarketProps & { children?: ReactNode }) {
  const { market, view } = props;
  if (market.institution === "cda") return <OrderBook {...props} />;
  if (market.institution === "posted")
    return <OfferBoard {...props}>{children}</OfferBoard>;
  return (
    <section
      className={`panel study-section ${children ? "study-market-workspace" : ""}`}
    >
      <h2>一括約定・第{market.call || 1}回 / 4回</h2>
      <p className="muted">
        注文は締切まで非公開です。締切までに送信しない場合、その回は注文なしとして進みます。未約定注文は各回で失効し、残り数量を次の回で再注文できます。
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
      {view.study!.teacher && (
        <StudyMarketHistory
          key={market.id}
          trades={market.trades}
          orders={market.orderHistory}
          clearings={market.clearings}
          offerHistory={market.offerHistory}
          showParticipants
        />
      )}
      {children}
    </section>
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
                (m) => !["done", "waiting", "countdown"].includes(m.stage),
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
        各期の終了後は自動で次の期へ進み、15期で終了します。
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

function OrderBook({ view, market, command, disabled }: MarketProps) {
  const latest = market.trades.at(-1);
  const teacher = view.me.role === "teacher";
  const best = market.orders
    .filter((o) => o.side !== view.me.role)
    .sort(
      (a, b) =>
        (view.me.role === "buyer" ? a.price - b.price : b.price - a.price) ||
        a.sequence - b.sequence,
    )[0];
  return (
    <section className="panel study-section study-order-book">
      <div className="study-book-heading">
        <h2>りんごの注文板</h2>
        <div className="study-last-trade" aria-label="直近約定値">
          <div>
            <span>直近約定値</span>
            <b>{latest ? money(latest.price) : "— 円"}</b>
          </div>
          <small>
            {latest
              ? `${teacher ? `全体 第${latest.round}期` : `制度内 第${((latest.round - 1) % 5) + 1}期`} · ${INSTITUTIONS[latest.institution].short} · ${timeLabel(latest.at)}`
              : "まだ約定はありません"}
          </small>
        </div>
      </div>
      <p className="muted">
        価格優先・時間優先。先に板にあった注文の価格で約定します。
      </p>
      <div className="study-book">
        {(["buyer", "seller"] as const).map((side) => {
          const rows = market.orders
            .filter((o) => o.side === side)
            .sort(
              (a, b) =>
                (side === "buyer" ? b.price - a.price : a.price - b.price) ||
                a.sequence - b.sequence,
            );
          return (
            <div key={side}>
              <h3 className={side === "buyer" ? "buy-text" : "sell-text"}>
                {side === "buyer" ? "買い注文" : "売り注文"}
              </h3>
              <div
                className="study-book-rows"
                role="region"
                aria-label={side === "buyer" ? "買い注文一覧" : "売り注文一覧"}
              >
                <table>
                  <thead>
                    <tr>
                      <th>価格（円）</th>
                      <th>数量</th>
                      {teacher && <th>参加者</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr
                        key={o.id}
                        className={
                          o.participantId === view.me.id
                            ? "study-own-order"
                            : undefined
                        }
                      >
                        <td>
                          {o.price}
                          {o.participantId === view.me.id && (
                            <span className="study-own-order-tag">あなた</span>
                          )}
                        </td>
                        <td>1</td>
                        {teacher && <td>{o.alias}</td>}
                      </tr>
                    ))}
                    {Array.from(
                      {
                        length: Math.max(
                          0,
                          Math.min(8, studyMarketSize(view.config) / 2) -
                            rows.length,
                        ),
                      },
                      (_, i) => (
                        <tr
                          key={`empty-${i}`}
                          className="study-book-placeholder"
                          aria-hidden="true"
                        >
                          <td>—</td>
                          <td>—</td>
                          {teacher && <td>—</td>}
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                {!rows.length && (
                  <p className="study-empty">まだ注文はありません</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!teacher && (
        <div className="study-book-action">
          {best && (
            <>
              <ExpectedProfit view={view} price={best.price} quantity={1} />
              <button
                className="button primary"
                disabled={disabled || view.study!.unitsUsed >= 2}
                onClick={() =>
                  void command({ type: "study-accept", orderId: best.id })
                }
              >
                {money(best.price)}で
                {view.me.role === "buyer" ? "買う" : "売る"}
              </button>
            </>
          )}
        </div>
      )}
      {teacher && (
        <StudyMarketHistory
          key={market.id}
          trades={market.trades}
          orders={market.orderHistory}
          clearings={market.clearings}
          offerHistory={market.offerHistory}
          showParticipants
        />
      )}
    </section>
  );
}

function OfferBoard({
  view,
  market,
  command,
  disabled,
  children,
}: MarketProps & { children?: ReactNode }) {
  const mine = market.activeBuyer === view.me.alias && view.me.role === "buyer";
  const timing = studyTiming(view.config);
  return (
    <section
      className={`panel study-section study-offers ${children ? "study-market-workspace" : ""}`}
    >
      <h2>売り手の提示価格</h2>
      {market.stage === "offer" ? (
        <p className="study-empty">
          {timing.offerSeconds}
          秒の提示時間が終わると、全売り手の価格と在庫が公開されます。
        </p>
      ) : (
        <>
          <div className="study-offer-list" aria-label="売り手の提示一覧">
            {market.offers.map((o) => (
              <div className="study-offer-card" key={o.id}>
                <div className="study-offer-info">
                  <span>{o.alias}</span>
                  <b>{money(o.price)}</b>
                  <span>在庫 {o.remaining}</span>
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
                  {o.remaining === 0 && <span className="muted">売り切れ</span>}
                </div>
              </div>
            ))}
          </div>
          {!market.offers.length && (
            <p className="study-empty">購入可能な在庫はありません。</p>
          )}
          <div className={`study-offer-status ${mine ? "is-my-turn" : ""}`}>
            <div role="status">
              <strong>
                {market.stage === "purchase"
                  ? view.me.role === "buyer"
                    ? mine
                      ? "今はあなたの番です"
                      : "今はあなたの番ではありません"
                    : `現在は ${market.activeBuyer} の購入時間です。`
                  : view.phase === "waiting"
                    ? "実験開始をお待ちください"
                    : "今期の購入時間は終了しました。"}
              </strong>
              {market.stage === "purchase" && view.me.role === "buyer" && (
                <p>
                  {mine
                    ? `${timing.buyerSeconds}秒以内に購入する数量を選んでください。`
                    : "自分の番になると購入できます。"}
                </p>
              )}
            </div>
          </div>
        </>
      )}
      {view.study!.teacher && (
        <StudyMarketHistory
          key={market.id}
          trades={market.trades}
          orders={market.orderHistory}
          clearings={market.clearings}
          offerHistory={market.offerHistory}
          showParticipants
        />
      )}
      {children}
    </section>
  );
}

function StudentOrder({ view, market, command, disabled }: MarketProps) {
  const [price, setPrice] = useState(""),
    [second, setSecond] = useState(""),
    [quantity, setQuantity] = useState(2 - view.study!.unitsUsed),
    [validation, setValidation] = useState("");
  const study = view.study!,
    buyer = view.me.role === "buyer",
    remaining = 2 - study.unitsUsed;
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
            return sum + (buyer ? v - p : p - v);
          }, 0)
      : null;
  if (!remaining)
    return <p className="success-message">今期の2単位の取引は完了しました。</p>;
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
  const formDisabled =
    disabled || (market.institution === "posted" && market.stage !== "offer");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidation("");
    if (formDisabled) return;
    const prices =
      market.institution === "call" && quantity === 2
        ? [Number(price), Number(second)]
        : [Number(price)];
    if (prices.some((p) => !Number.isInteger(p) || p < 1 || p > 999)) {
      setValidation("注文価格は1〜999円の整数で入力してください。");
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
            type="number"
            min={1}
            max={999}
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
              max={999}
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
        ：{money(expected)}
      </p>
      <p className="field-help">
        損失が出る場合もあります。条件を確認してください。
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
      <button className="button primary full" disabled={formDisabled}>
        {market.institution === "cda"
          ? "注文を出す"
          : market.institution === "call"
            ? "今回の注文を確定"
            : "価格と数量を確定"}
      </button>
      {market.institution === "cda" && market.myOrders.length > 0 && (
        <div className="study-standing-order">
          <p className="field-help">
            注文中：{money(market.myOrders[0].price)}（再送信で変更）
          </p>
          <button
            type="button"
            className="text-button"
            aria-label="注文を取り消す"
            disabled={disabled}
            onClick={() => void command({ type: "study-cancel" })}
          >
            取消
          </button>
        </div>
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
  if (!study.unitLimits || study.unitsUsed + quantity > 2) return null;
  const profit = study.unitLimits
    .slice(study.unitsUsed, study.unitsUsed + quantity)
    .reduce(
      (sum, value) =>
        sum + (view.me.role === "buyer" ? value - price : price - value),
      0,
    );
  return (
    <small className={profit < 0 ? "loss" : "field-help"}>
      利益 {money(profit)}
      {profit < 0 ? "（損失）" : ""}
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
    eq = teacher.equilibrium;
  return (
    <section className="panel study-section">
      <h2>市場{market.id}の価格・数量・効率性</h2>
      <p className="muted">
        均衡価格{" "}
        {eq.low === eq.high ? money(eq.low) : `${eq.low}〜${eq.high}円`} ／
        正余剰の数量 {eq.quantity}、ゼロ余剰を含む上限 {eq.quantityMax} ／
        最大総余剰 {money(eq.surplus)}
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
        途中終了・取引ゼロの期は傾き計算から除外します。傾きは制度内1〜5期の記述統計で、有意差検定ではありません。
      </p>
    </section>
  );
}
