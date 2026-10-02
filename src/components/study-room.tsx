"use client";

import Image from "next/image";
import Link from "next/link";
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
import {
  StudyPersonalHistory,
  StudyTradeFeedback,
} from "./study-personal-trades";
import { PriceChart } from "./price-chart";
import { ConfirmDialog } from "./confirm-dialog";
import { StudySettingsEditor } from "./study-settings";
import { decimal, timeLabel } from "@/lib/client";
import { INSTITUTIONS } from "@/lib/study-rules";
import type { StudyMarketView, StudyStage } from "@/lib/study-types";
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
  const market =
    teacher?.markets.find((m) => m.id === selected) ?? study.market;
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
    market.stage === "done";
  return (
    <div className={`study-shell ${demo ? "study-demo" : ""}`}>
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
        <Link href="/guide" target="_blank" className="quiet-link">
          実験のルール
        </Link>
      </Header>
      <main className="room-main study-main">
        {toolbar}
        <div className="room-heading study-room-context">
          <div>
            <div className="eyebrow">
              {teacher
                ? "教員用ダッシュボード"
                : `市場${market.id} · ${view.me.nickname} さん · ${view.me.alias}`}
            </div>
            <h1>{teacher ? view.config.title : "取引ルーム"}</h1>
          </div>
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
              <p>{INSTITUTIONS[market.institution].description}</p>
            </div>
            <span className="study-units">1商品・各自2単位／期</span>
          </section>
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
                            <td>{m.participantCount}/16</td>
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
                      : `この市場は ${market.participantCount} / 16人が入室しています。教員が実験を開始し、16人そろうと自動で始まります。`}
                </p>
              </div>
            </div>
          )}
        <div
          className={`study-trading-grid ${teacher ? "teacher-layout" : ""} ${market.institution === "posted" && view.me.role === "buyer" ? "purchase-layout" : ""}`}
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
              />
            )}
          </div>
          {!teacher && (
            <aside className="panel study-section private-panel">
              <h2>
                <LockKeyhole size={16} /> あなたの条件 <small>非公開</small>
              </h2>
              <p>
                {view.me.role === "buyer"
                  ? "購入する単位ごとの価値"
                  : "販売する単位ごとの費用"}
              </p>
              <div className="study-values">
                {study.unitLimits!.map((v, i) => (
                  <div
                    key={i}
                    className={i < study.unitsUsed ? "used-unit" : ""}
                  >
                    <span>
                      {i + 1}単位目{i < study.unitsUsed ? "・取引済み" : ""}
                    </span>
                    <b>{money(v)}</b>
                  </div>
                ))}
              </div>
              <p className="muted">
                役割と条件は全15期で固定。残り <b>{2 - study.unitsUsed}</b>{" "}
                単位です。
              </p>
              <StudentOrder
                key={`${market.round}-${market.stageKey}-${study.unitsUsed}`}
                view={view}
                market={market}
                command={command}
                disabled={blocked}
              />
              <StudyPersonalHistory
                key={`${view.code}-${view.me.id}-${study.myTrades.at(-1)?.id ?? "empty"}`}
                trades={study.myTrades}
              />
            </aside>
          )}
          <section className="panel study-section study-price-panel">
            <h2>
              {teacher
                ? `市場${market.id}の全期間の取引価格`
                : "全期間の取引価格"}
            </h2>
            <p className="muted">
              市場{market.id}の履歴を全期間表示します。
              {market.order
                .map(
                  (i, n) =>
                    `${n * 5 + 1}〜${n * 5 + 5}期：${INSTITUTIONS[i].short}`,
                )
                .join(" ／ ")}
            </p>
            <PriceChart
              trades={market.trades.map((t) => ({ ...t, good: "apple" }))}
              rounds={15}
              periodAxis
              fill
              equilibrium={teacher?.equilibrium}
            />
            <StudyDetailDialog
              label={`取引履歴をすべて見る（${market.trades.length}件）`}
              title={`市場${market.id}の取引履歴`}
            >
              <div className="study-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>期</th>
                      <th>制度</th>
                      <th>時刻</th>
                      <th>価格</th>
                      <th>買い手</th>
                      <th>売り手</th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.trades.map((t) => (
                      <tr key={t.id}>
                        <td>{t.round}</td>
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
        {!demo && (
          <p className="room-bottom-note">表示は約1秒ごとに更新されます。</p>
        )}
      </main>
    </div>
  );
}

function MarketActivity(props: MarketProps) {
  const { market } = props;
  if (market.institution === "cda") return <OrderBook {...props} />;
  if (market.institution === "posted") return <OfferBoard {...props} />;
  return (
    <section className="panel study-section">
      <h2>一括約定・第{market.call || 1}回 / 4回</h2>
      <p className="muted">
        注文は締切まで非公開です。各回の未約定注文は失効し、残り数量を次の受付で再注文できます。
      </p>
      <p className="field-help">
        送信は各回1回。2単位目の買値は1単位目以下、売値は1単位目以上にしてください。
        実際の利益は清算価格で決まります。
      </p>
      <div className="study-table-wrap">
        <table>
          <thead>
            <tr>
              <th>期</th>
              <th>清算回</th>
              <th>共通の取引価格</th>
              <th>約定数量</th>
            </tr>
          </thead>
          <tbody>
            {market.clearings
              .filter((c) => c.round === market.round)
              .map((c) => (
                <tr key={`${c.round}-${c.call}`}>
                  <td>{c.round}</td>
                  <td>{c.call}</td>
                  <td>{c.price === null ? "成立なし" : money(c.price)}</td>
                  <td>{c.quantity}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!market.clearings.some((c) => c.round === market.round) && (
        <p className="study-empty">締切後に清算結果が表示されます。</p>
      )}
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
            disabled={disabled}
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
                (m) => !["done", "waiting"].includes(m.stage),
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
        実験を開始すると、各市場は16人そろい次第、取引を開始します。各期の終了後は自動で次の期へ進み、15期で終了します。
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
  return (
    <section className="panel study-section study-order-book">
      <h2>りんごの注文板</h2>
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
                      <th>参加者</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o.id}>
                        <td>{o.price}</td>
                        <td>1</td>
                        <td>{o.alias}</td>
                      </tr>
                    ))}
                    {Array.from(
                      { length: Math.max(0, 8 - rows.length) },
                      (_, i) => (
                        <tr
                          key={`empty-${i}`}
                          className="study-book-placeholder"
                          aria-hidden="true"
                        >
                          <td>—</td>
                          <td>—</td>
                          <td>—</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                {!rows.length && (
                  <p className="study-empty">まだ注文はありません</p>
                )}
              </div>
              <div className="study-book-action">
                {rows.length > 0 &&
                  side !== view.me.role &&
                  view.me.role !== "teacher" && (
                    <>
                      <button
                        className="button secondary full"
                        disabled={disabled || view.study!.unitsUsed >= 2}
                        onClick={() =>
                          void command({
                            type: "study-accept",
                            orderId: rows[0].id,
                          })
                        }
                      >
                        {money(rows[0].price)}で
                        {side === "seller" ? "買う" : "売る"}
                      </button>
                      <ExpectedProfit
                        view={view}
                        price={rows[0].price}
                        quantity={1}
                      />
                    </>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OfferBoard({ view, market, command, disabled }: MarketProps) {
  const mine = market.activeBuyer === view.me.alias && view.me.role === "buyer";
  return (
    <section className="panel study-section study-offers">
      <h2>売り手の提示価格</h2>
      {market.stage === "offer" ? (
        <p className="study-empty">
          60秒の提示時間が終わると、全売り手の価格と在庫が公開されます。
        </p>
      ) : (
        <>
          <div className={`study-offer-status ${mine ? "is-my-turn" : ""}`}>
            <p>
              {market.stage === "purchase"
                ? mine
                  ? "あなたの購入時間です。10秒以内に選んでください。"
                  : `現在は ${market.activeBuyer} の購入時間です。`
                : "今期の購入時間は終了しました。"}
            </p>
            {mine && (
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => void command({ type: "posted-pass" })}
              >
                今回は購入を終える
              </button>
            )}
          </div>
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
        </>
      )}
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
    price && !(market.institution === "call" && quantity === 2 && !second)
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
          : market.myOrders
              .map((o) => `${o.unit}単位目：${o.price}円`)
              .join("、")}
        この提示は変更できません。
      </p>
    );
  const formDisabled =
    disabled || (market.institution === "posted" && market.stage !== "offer");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidation("");
    if (formDisabled) return;
    const prices =
      market.institution === "posted" && quantity === 0
        ? []
        : market.institution === "call" && quantity === 2
          ? [Number(price), Number(second)]
          : [Number(price)];
    if (prices.some((p) => !Number.isInteger(p) || p < 1 || p > 999)) {
      setValidation("注文価格は1〜999円の整数で入力してください。");
      return;
    }
    if (market.institution === "cda")
      await command({ type: "study-quote", price: Number(price) });
    else if (market.institution === "call")
      await command({
        type: "call-submit",
        prices:
          quantity === 2 ? [Number(price), Number(second)] : [Number(price)],
      });
    else
      await command({
        type: "posted-offer",
        price: quantity === 0 ? 1 : Number(price),
        quantity,
      });
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className={`study-order-form ${market.institution === "call" ? "study-call-form" : ""}`}
    >
      {market.institution !== "cda" && (
        <label className="field">
          提示する数量
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            disabled={formDisabled}
          >
            {market.institution === "posted" && (
              <option value={0}>0単位（出品しない）</option>
            )}
            {Array.from({ length: remaining }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}単位
              </option>
            ))}
          </select>
        </label>
      )}
      {quantity !== 0 && (
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
      )}
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
        <>
          <p className="field-help">
            現在 {money(market.myOrders[0].price)}{" "}
            で注文中。再送信すると置き換わります。
          </p>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => void command({ type: "study-cancel" })}
          >
            注文を取り消す
          </button>
        </>
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
