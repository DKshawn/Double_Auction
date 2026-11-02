"use client";
import { useState, type FormEvent } from "react";
import { Download, LockKeyhole, Send, X } from "lucide-react";
import type { Action, RoomView, Side } from "@/experiments/emh/types";
import { PriceChart } from "./price-chart";

export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null
    ? "—"
    : n.toLocaleString("ja-JP", { maximumFractionDigits: digits });
export const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${fmt(n * 100, 1)}%`;
export type RunAction = (action: Action) => Promise<void>;

export function OrderPanel({
  room,
  act,
  disabled,
  compact = false,
}: {
  room: RoomView;
  act: RunAction;
  disabled: boolean;
  compact?: boolean;
}) {
  const [side, setSide] = useState<Side>("bid");
  const [price, setPrice] = useState("");
  const [bidPrice, setBidPrice] = useState("");
  const [askPrice, setAskPrice] = useState("");
  const canTrade =
    !disabled && room.status === "trading" && room.pausedAt === null;
  const student = room.role === "student";
  async function submit(
    e: FormEvent,
    submittedSide: Side = side,
    submittedPrice = price,
  ) {
    e.preventDefault();
    await act({
      kind: "quote",
      side: submittedSide,
      price: Number(submittedPrice),
      unitKey: room.unitKey,
    });
  }
  return (
    <section className="panel order-panel">
      <div className="section-heading">
        <h2>現在の提示</h2>
        <span className="muted">1単位</span>
      </div>
      <div className="quote-grid">
        {(["bid", "ask"] as const).map((s) => {
          const q = room[s];
          const own = q?.participantId === room.me?.id;
          return (
            <div key={s} className={`quote-card ${s}`}>
              <div className="quote-label">
                {s === "bid" ? "最高買値" : "最低売値"}
              </div>
              <strong>{fmt(q?.price)}</strong>
              <div className="quote-owner">
                {q ? `被験者 ${q.seat}${own ? "（あなた）" : ""}` : "提示なし"}
              </div>
              {student &&
                (own ? (
                  <button
                    className="button small quiet"
                    disabled={!canTrade}
                    onClick={() =>
                      act({
                        kind: "cancel",
                        side: s,
                        quoteId: q!.id,
                        unitKey: room.unitKey,
                      })
                    }
                  >
                    <X size={14} />
                    取り消す
                  </button>
                ) : (
                  <button
                    className={`button small ${s === "bid" ? "sell" : "buy"}`}
                    disabled={
                      !canTrade || !q || (s === "bid" && !room.me?.holdings)
                    }
                    onClick={() =>
                      act({
                        kind: "accept",
                        side: s,
                        quoteId: q!.id,
                        unitKey: room.unitKey,
                      })
                    }
                  >
                    {s === "bid" ? "この価格で売る" : "この価格で買う"}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
      {student && room.exp2 ? (
        <div className="quote-form exp2-quote-forms">
          {(["bid", "ask"] as const).map((quoteSide) => {
            const buying = quoteSide === "bid";
            const label = buying ? "買値" : "売値";
            return (
              <form
                key={quoteSide}
                onSubmit={(event) =>
                  submit(event, quoteSide, buying ? bidPrice : askPrice)
                }
                className="price-entry"
              >
                <label className="sr-only" htmlFor={`exp2-${quoteSide}-price`}>
                  {label}
                </label>
                <input
                  id={`exp2-${quoteSide}-price`}
                  inputMode="numeric"
                  type="number"
                  placeholder={`${label}を入力`}
                  min={1}
                  max={100000}
                  step={1}
                  value={buying ? bidPrice : askPrice}
                  onChange={(event) =>
                    (buying ? setBidPrice : setAskPrice)(event.target.value)
                  }
                  disabled={!canTrade}
                  required
                />
                <button
                  className={`button ${buying ? "buy" : "sell"}`}
                  disabled={!canTrade || (!buying && !room.me?.holdings)}
                >
                  {label}を提示
                </button>
              </form>
            );
          })}
          <p className="field-note">
            買値は高く、売値は低く。相手の提示価格で成立。
          </p>
        </div>
      ) : (
        student && (
          <form onSubmit={submit} className="quote-form">
            <div className="segmented" role="group" aria-label="提示の種類">
              <button
                type="button"
                aria-pressed={side === "bid"}
                onClick={() => setSide("bid")}
              >
                買値を提示
              </button>
              <button
                type="button"
                aria-pressed={side === "ask"}
                onClick={() => setSide("ask")}
              >
                売値を提示
              </button>
            </div>
            <div className="price-entry">
              <label className="sr-only" htmlFor="quote-price">
                提示価格
              </label>
              <input
                id="quote-price"
                inputMode="numeric"
                type="number"
                placeholder="価格を入力"
                min={1}
                max={100000}
                step={1}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={!canTrade}
                required
              />
              <button
                className="button primary"
                disabled={!canTrade || (side === "ask" && !room.me?.holdings)}
              >
                <Send size={16} />
                提示
              </button>
            </div>
            <p className="field-note">
              {compact ? (
                "買値は高く、売値は低く。相手の提示価格で成立。"
              ) : (
                <>
                  {side === "bid"
                    ? "買値は現在より高く。"
                    : "売値は現在より低く。"}{" "}
                  相手の価格に達すると、その価格で成立します。
                </>
              )}
            </p>
          </form>
        )
      )}
    </section>
  );
}
export function PersonalPanel({ room }: { room: RoomView }) {
  const me = room.me!;
  return (
    <section className="panel private-panel">
      <div className="section-heading">
        <h2>あなたの配当</h2>
        <LockKeyhole size={15} aria-label="本人のみ" />
      </div>
      <div className="dividend-grid">
        <div className={room.period === "A" ? "current" : ""}>
          <span>A期</span>
          <strong>{fmt(me.dividends?.a)}</strong>
        </div>
        <div className={room.period === "B" ? "current" : ""}>
          <span>B期</span>
          <strong>{fmt(me.dividends?.b)}</strong>
        </div>
      </div>
      <p className="field-note">期末の保有1単位につき受け取る得点</p>
      <div className="personal-lines">
        <div>
          <span>このラウンドの配当受取</span>
          <strong>{fmt(me.dividend)}</strong>
        </div>
        <div>
          <span>このラウンドの得点</span>
          <strong>{fmt(me.cash + me.dividend)}</strong>
        </div>
        <div>
          <span>終了ラウンドの累計</span>
          <strong>{fmt(me.totalProfit)}</strong>
        </div>
      </div>
    </section>
  );
}
export function HistoryPanel({
  room,
  compact = false,
}: {
  room: RoomView;
  compact?: boolean;
}) {
  const [selection, setSelection] = useState<number | null>(null);
  const year = selection ?? room.year;
  const trades = room.trades.filter((t) => t.year === year);
  return (
    <section className="panel history-panel">
      <div className="section-heading">
        <h2>取引価格</h2>
        <label className="round-select">
          <span className="sr-only">表示ラウンド</span>
          <select
            value={selection ?? "current"}
            onChange={(e) =>
              setSelection(
                e.target.value === "current" ? null : Number(e.target.value),
              )
            }
          >
            <option value="current">現在 · 第{room.year}ラウンド</option>
            {Array.from({ length: room.year }, (_, i) => (
              <option key={i} value={i + 1}>
                第{i + 1}ラウンド
              </option>
            ))}
          </select>
        </label>
      </div>
      <PriceChart
        trades={trades}
        benchmarks={room.benchmarks}
        singlePeriod={!!room.exp2}
        compact={compact}
      />
      <div className="table-scroll trade-table">
        <table>
          <thead>
            <tr>
              <th>取引</th>
              {!room.exp2 && <th>期</th>}
              <th>価格</th>
              <th>買い手</th>
              <th>売り手</th>
            </tr>
          </thead>
          <tbody>
            {trades.length ? (
              [...trades].reverse().map((t) => (
                <tr
                  key={t.id}
                  className={
                    room.me &&
                    (t.buyerId === room.me.id || t.sellerId === room.me.id)
                      ? "my-trade"
                      : ""
                  }
                >
                  <td>{t.sequence}</td>
                  {!room.exp2 && (
                    <td>
                      <span className={`period-chip ${t.period.toLowerCase()}`}>
                        {t.period}
                      </span>
                    </td>
                  )}
                  <td className="numeric emphasis">{fmt(t.price)}</td>
                  <td>
                    #{t.buyerSeat}
                    {t.buyerId === room.me?.id && " · あなた"}
                  </td>
                  <td>
                    #{t.sellerSeat}
                    {t.sellerId === room.me?.id && " · あなた"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={room.exp2 ? 4 : 5} className="empty-cell">
                  まだ取引はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function ParticipantsPanel({ room }: { room: RoomView }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>参加者</h2>
        <span className="muted">{room.participantCount}人</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>番号</th>
              <th>名前</th>
              <th>参加者番号</th>
              <th>{room.exp2 ? "状態 1 / 2 / 3 配当" : "A / B 配当"}</th>
              <th>保有</th>
              <th>売買収支</th>
              <th>累計得点</th>
            </tr>
          </thead>
          <tbody>
            {[...room.participants]
              .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
              .map((p) => (
                <tr key={p.id}>
                  <td>{p.seat ? `#${p.seat}` : "—"}</td>
                  <td>{p.name}</td>
                  <td className="muted">{p.studentId}</td>
                  <td>
                    {room.exp2 && p.type
                      ? room.exp2.allDividends?.[p.type - 1]?.join(" / ")
                      : p.dividends
                        ? `${p.dividends.a} / ${p.dividends.b}`
                        : "—"}
                  </td>
                  <td>{p.holdings}</td>
                  <td>{fmt(p.cash)}</td>
                  <td className="emphasis">{fmt(p.totalProfit)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function ResultsPanel({ room }: { room: RoomView }) {
  const teacher = room.role === "teacher";
  return (
    <section className="panel results-panel">
      <div className="section-heading">
        <h2>{teacher ? "ラウンドの結果" : "あなたの記録"}</h2>
        <span className="muted">{room.results.length} 期終了</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ラウンド</th>
              <th>{room.exp2 ? "状態" : "期"}</th>
              {teacher ? (
                <>
                  <th>成立数</th>
                  <th>平均価格</th>
                  <th>{room.exp2 ? "価格 / RE" : "価格 / PF"}</th>
                  <th>配当 / 最大配当</th>
                  <th>改善分の効率</th>
                </>
              ) : (
                <>
                  <th>期末保有</th>
                  <th>配当</th>
                  <th>売買収支</th>
                  <th>得点</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {room.results.length ? (
              room.results.map((r) => {
                const payout = r.payouts.find(
                  (p) => p.participantId === room.me?.id,
                );
                return (
                  <tr key={`${r.year}${r.period}`}>
                    <td>{r.year}</td>
                    <td>
                      <span className={`period-chip ${r.period.toLowerCase()}`}>
                        {room.exp2 ? r.state : r.period}
                      </span>
                    </td>
                    {teacher ? (
                      <>
                        <td>{r.volume}</td>
                        <td>{fmt(r.meanPrice, 1)}</td>
                        <td>{pct(r.priceRatio)}</td>
                        <td>{pct(r.allocationEfficiency)}</td>
                        <td>{pct(r.gainEfficiency)}</td>
                      </>
                    ) : (
                      <>
                        <td>{payout?.holdings}</td>
                        <td>{fmt(payout?.dividend)}</td>
                        <td>{fmt(payout?.cash)}</td>
                        <td className="emphasis">
                          {fmt(payout?.yearProfit)}
                          {!room.exp2 && r.period === "A" && (
                            <span className="muted"> *</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={teacher ? 7 : 6} className="empty-cell">
                  期が終了すると結果を表示します
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {teacher ? (
        <details className="metric-help">
          <summary className="button secondary small-button disclosure-button">
            指標の計算
          </summary>
          <p>
            {room.exp2
              ? "価格 / RE：平均取引価格 ÷ RE均衡価格。"
              : "価格 / PF：その期の平均取引成立価格 ÷ 完全予見均衡価格。"}
            取引成立がない期は空欄です。
          </p>
          <p>
            配当 / 最大配当：実際の総配当 ÷
            全証券を最も配当の高いタイプが保有した場合の総配当。
          </p>
          <p>
            改善分の効率：（実際の総配当 − 初期配分の総配当）÷（最大総配当 −
            初期配分の総配当）。全員の配当が同じ場合は定義しません。
          </p>
        </details>
      ) : !room.exp2 ? (
        <p className="field-note">
          * A期の得点は途中経過。B期の得点がそのラウンドの確定得点です。
        </p>
      ) : null}
      {room.exp2 && (teacher || room.reveal) && (
        <div className="debrief">
          <h3>実験2の条件と均衡</h3>
          <p>事前確率：{room.exp2.prior.join(" / ")}</p>
          <table>
            <thead>
              <tr>
                <th>タイプ</th>
                <th>状態1</th>
                <th>状態2</th>
                <th>状態3</th>
              </tr>
            </thead>
            <tbody>
              {room.exp2.allDividends?.map((d, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {d.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th>ラウンド</th>
                <th>状態</th>
                <th>PI</th>
                <th>RE</th>
              </tr>
            </thead>
            <tbody>
              {room.results.map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td>
                  <td>{r.state}</td>
                  <td>{fmt(r.piPrice, 2)}</td>
                  <td>{fmt(r.rePrice, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {room.reveal && room.conditions && room.benchmarks && (
        <div className="debrief">
          <h3>実験の解説</h3>
          <div className="debrief-grid">
            <table>
              <thead>
                <tr>
                  <th>タイプ</th>
                  <th>A配当</th>
                  <th>B配当</th>
                </tr>
              </thead>
              <tbody>
                {room.conditions.map((d, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{d.a}</td>
                    <td>{d.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <p>
                A期の私的情報均衡 <strong>{room.benchmarks.naiveA}</strong>
              </p>
              <p>
                A期の完全予見均衡 <strong>{room.benchmarks.perfectA}</strong>
              </p>
              <p>
                B期の均衡 <strong>{room.benchmarks.perfectB}</strong>
              </p>
            </div>
          </div>
          <p>
            他の人の配当について取引を通じて学べるなら、A期に買った証券をB期で売る価格も判断に反映できます。A期の完全予見均衡は「A配当の最大値
            ＋ B配当の最大値」です。
          </p>
        </div>
      )}
    </section>
  );
}
export function ExportPanel({
  room,
  demo,
}: {
  room: RoomView;
  demo?: boolean;
}) {
  if (demo) return null;
  const teacher = room.role === "teacher";
  const options = teacher
    ? [
        ["trades", "取引"],
        ["results", "期別結果"],
        ["payouts", "個人別配当"],
        ["participants", "参加者"],
        ["conditions", "実験条件"],
        ["audit", "操作記録"],
      ]
    : [["personal", "自分の記録"]];
  return (
    <div className="export-links">
      {options.map(([kind, label]) => (
        <a
          key={kind}
          href={`/api/rooms/${room.code}/emh/export?session=${room.role}&market=${room.marketId ?? 1}&kind=${kind}`}
          className="button small secondary"
        >
          <Download size={14} />
          {label}
          {kind !== "conditions" && <span className="filetype">CSV</span>}
        </a>
      ))}
    </div>
  );
}
