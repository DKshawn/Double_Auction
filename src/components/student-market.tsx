"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleHelp,
  LockKeyhole,
  ReceiptText,
  Send,
  X,
} from "lucide-react";
import { GOODS, goodName, type GoodId } from "@/lib/catalog";
import type { Command, Quote, RoomView } from "@/lib/types";
import { decimal, timeLabel } from "@/lib/client";
import { PriceChart } from "./price-chart";
import { Spinner } from "./shell";

type Actions = {
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
};

export function StudentMarket({
  view,
  command,
  disabled,
}: { view: RoomView } & Actions) {
  const [good, setGood] = useState<GoodId>("apple");
  const [showHistory, setShowHistory] = useState(false);
  const selected = GOODS.find((g) => g.id === good)!;
  const trades = view.trades.filter(
    (t) => t.round === view.round && t.good === good,
  );
  const bids = view.quotes
    .filter((q) => q.good === good && q.side === "buyer")
    .sort((a, b) => b.price - a.price || a.sequence - b.sequence);
  const asks = view.quotes
    .filter((q) => q.good === good && q.side === "seller")
    .sort((a, b) => a.price - b.price || a.sequence - b.sequence);
  const me = view.me;
  const mine = view.trades.filter(
    (t) => t.buyerId === me.id || t.sellerId === me.id,
  );
  return (
    <>
      <div className="product-tabs" aria-label="取引する商品">
        {GOODS.map((g) => {
          const last = view.trades
            .filter((t) => t.good === g.id && t.round === view.round)
            .at(-1);
          return (
            <button
              key={g.id}
              className={`product-tab ${good === g.id ? "selected" : ""}`}
              aria-pressed={good === g.id}
              onClick={() => setGood(g.id)}
            >
              <div className="product-photo">
                <Image
                  src={g.image}
                  alt={g.name}
                  width={100}
                  height={100}
                  priority
                />
              </div>
              <span className="product-title">
                <b>{g.name}</b>
                <small>
                  {me.used.includes(g.id) ? (
                    <>
                      <Check size={12} />
                      今ラウンド完了
                    </>
                  ) : (
                    "取引可能：1単位"
                  )}
                </small>
              </span>
              <span className="product-last">
                <small>最終取引価格</small>
                <strong>{last?.price ?? "—"}</strong>
                <small>円</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="market-workspace">
        <div className="market-column">
          <section className="panel order-book">
            <div className="panel-heading">
              <h2>{selected.name}の注文板</h2>
              <span className="subtle-tag">価格優先・時間優先</span>
            </div>
            <div className="book-columns">
              <Book
                side="buyer"
                quotes={bids}
                view={view}
                command={command}
                disabled={disabled}
              />
              <Book
                side="seller"
                quotes={asks}
                view={view}
                command={command}
                disabled={disabled}
              />
            </div>
            <div className="panel-note">
              <CircleHelp size={14} />
              価格が合うと、先に出ていた注文の価格で約定します。
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>取引価格の動き</h2>
              <span className="muted small">今ラウンド・{trades.length}件</span>
            </div>
            <PriceChart trades={trades} />
            <div className="recent-trades">
              {trades.length ? (
                trades
                  .slice(-4)
                  .reverse()
                  .map((t) => (
                    <div key={t.id}>
                      <span>{timeLabel(t.at)}</span>
                      <b>
                        {t.price} <small>円</small>
                      </b>
                      <span>
                        {t.buyerAlias} ↔ {t.sellerAlias}
                      </span>
                    </div>
                  ))
              ) : (
                <p>まだ取引はありません。最初の注文を出してみましょう。</p>
              )}
            </div>
          </section>
        </div>
        <OrderForm
          key={`${good}-${view.round}`}
          view={view}
          good={good}
          command={command}
          disabled={disabled}
        />
      </div>
      <section className="panel history-panel">
        <button
          className="history-heading"
          aria-expanded={showHistory}
          onClick={() => setShowHistory(!showHistory)}
        >
          <span>
            <ReceiptText size={18} />
            <b>あなたの取引履歴</b>
            <span className="count-tag">{mine.length}</span>
          </span>
          <span className="muted small">
            {showHistory ? "閉じる −" : "表示する ＋"}
          </span>
        </button>
        {showHistory && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ラウンド</th>
                  <th>商品</th>
                  <th>時刻</th>
                  <th>取引価格（円）</th>
                  <th>利益（円）</th>
                </tr>
              </thead>
              <tbody>
                {mine
                  .slice()
                  .reverse()
                  .map((t) => (
                    <tr key={t.id}>
                      <td>{t.round}</td>
                      <td>{goodName(t.good)}</td>
                      <td>{timeLabel(t.at)}</td>
                      <td>{t.price}</td>
                      <td className="profit">
                        +
                        {me.role === "buyer"
                          ? me.limits![t.good] - t.price
                          : t.price - me.limits![t.good]}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!mine.length && (
              <p className="empty-state">
                取引が成立すると履歴が表示されます。
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function Book({
  side,
  quotes,
  view,
  command,
  disabled,
}: { side: "buyer" | "seller"; quotes: Quote[]; view: RoomView } & Actions) {
  const buyer = side === "buyer";
  return (
    <div className={`book-side ${buyer ? "bid-side" : "ask-side"}`}>
      <div className="book-title">
        <b>
          {buyer ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
          {buyer ? "買い注文" : "売り注文"}
        </b>
        <span>{quotes.length}件</span>
      </div>
      <div className="book-labels">
        <span>価格（円）</span>
        <span>数量</span>
        <span>参加者</span>
      </div>
      <div className="book-rows">
        {quotes.length ? (
          quotes.map((q, i) => (
            <div
              key={q.id}
              className={`book-row ${i === 0 ? "best" : ""} ${q.participantId === view.me.id ? "own-order" : ""}`}
            >
              <b>{q.price}</b>
              <span>1</span>
              <span>{q.participantId === view.me.id ? "あなた" : q.alias}</span>
            </div>
          ))
        ) : (
          <div className="book-empty">
            <span className="empty-book-icon">
              {buyer ? <ArrowUpRight size={24} /> : <ArrowDownLeft size={24} />}
            </span>
            <p>まだ{buyer ? "買い" : "売り"}注文はありません</p>
            <small>注文が入るとここに並びます</small>
          </div>
        )}
      </div>
      {view.me.role !== side && quotes[0] && (
        <button
          className={`button accept-button ${buyer ? "bid-accept" : "ask-accept"}`}
          disabled={
            disabled ||
            view.me.used.includes(quotes[0].good) ||
            (view.me.role === "buyer"
              ? quotes[0].price > view.me.limits![quotes[0].good]
              : quotes[0].price < view.me.limits![quotes[0].good])
          }
          onClick={() =>
            void command({ type: "accept", quoteId: quotes[0].id })
          }
        >
          {quotes[0].price}円で{buyer ? "売る" : "買う"}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}

function OrderForm({
  view,
  good,
  command,
  disabled,
}: { view: RoomView; good: GoodId } & Actions) {
  const me = view.me;
  const buyer = me.role === "buyer";
  const current = view.quotes.find(
    (q) => q.good === good && q.participantId === me.id,
  );
  const [price, setPrice] = useState(current ? String(current.price) : "");
  const [sending, setSending] = useState(false);
  const limit = me.limits![good];
  const done = me.used.includes(good);
  const expected = price
    ? buyer
      ? limit - Number(price)
      : Number(price) - limit
    : null;
  const valid =
    price !== "" &&
    Number.isInteger(Number(price)) &&
    Number(price) >= 1 &&
    Number(price) <= 999 &&
    expected! >= 0;
  const myTrade = view.trades.find(
    (t) =>
      t.good === good &&
      t.round === view.round &&
      (t.buyerId === me.id || t.sellerId === me.id),
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    setSending(true);
    await command({ type: "quote", good, price: Number(price) });
    setSending(false);
  }
  return (
    <aside className="panel private-panel">
      <div className="panel-heading">
        <h2>あなたの取引</h2>
        <span className="private-tag">
          <LockKeyhole size={11} />
          非公開
        </span>
      </div>
      <div className="private-content">
        <div className="private-value">
          <span>
            {goodName(good)}の{buyer ? "価値" : "費用"}
          </span>
          <div>
            <strong>{limit}</strong>
            <span>円 / 単位</span>
          </div>
          <small>
            {buyer
              ? "購入できる価格の上限です。"
              : "販売できる価格の下限です。"}
          </small>
        </div>
        {done ? (
          <div className="completed-trade">
            <CheckCircle2 size={32} />
            <h3>今ラウンドの取引完了</h3>
            <p>
              {myTrade?.price}円で{buyer ? "購入" : "販売"}しました。
            </p>
            <span>ほかの商品を選んで取引できます。</span>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="field order-price-label">
              {buyer ? "買いたい価格" : "売りたい価格"}
              <span className="price-input-wrap">
                <input
                  aria-label={buyer ? "買いたい価格" : "売りたい価格"}
                  type="number"
                  inputMode="numeric"
                  placeholder="価格を入力"
                  min={buyer ? 1 : limit}
                  max={buyer ? limit : 999}
                  step={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  disabled={disabled}
                />
                <span>円</span>
              </span>
            </label>
            <div className="expected-profit">
              <span>この価格での利益</span>
              <b
                className={
                  expected !== null && expected < 0 ? "loss" : "profit"
                }
              >
                {expected !== null && expected >= 0 ? "+" : ""}
                {decimal(expected)}
                <small> 円</small>
              </b>
            </div>
            <button
              className="button primary full"
              disabled={disabled || !valid || sending}
            >
              {sending ? (
                <Spinner />
              ) : (
                <>
                  <Send size={16} />
                  {current ? "注文を更新する" : "注文を出す"}
                </>
              )}
            </button>
            <p className="form-hint">1回の注文は1単位です。</p>
          </form>
        )}
        {current && (
          <div className="standing-order">
            <div>
              <span className="pulse-dot" />
              <span>{current.price}円で注文中</span>
            </div>
            <button
              className="icon-button"
              aria-label="注文を取り消す"
              disabled={disabled}
              onClick={() => void command({ type: "cancel", good })}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="profit-summary">
          <div>
            <span>今ラウンドの利益</span>
            <b>
              {me.roundProfit}
              <small> 円</small>
            </b>
          </div>
          <div>
            <span>累積利益</span>
            <b>
              {me.profit}
              <small> 円</small>
            </b>
          </div>
        </div>
        <div className="formula-note">
          {buyer
            ? "利益 ＝ 自分の価値 − 取引価格"
            : "利益 ＝ 取引価格 − 自分の費用"}
        </div>
      </div>
    </aside>
  );
}
