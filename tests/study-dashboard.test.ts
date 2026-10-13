import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyAllMarketResults } from "../src/components/study-room";
import { DemoSession } from "../src/lib/demo";
import type {
  Institution,
  StudyMarketView,
  StudyMetric,
} from "../src/lib/study-types";

function trade(
  market: number,
  institution: Institution,
  round: number,
  price: number,
): StudyMarketView["trades"][number] {
  return {
    id: `${market}-${institution}-${round}`,
    sequence: 1,
    at: 1000,
    market,
    institution,
    round,
    price,
    call: institution === "call" ? 1 : null,
    buyerId: "buyer",
    sellerId: "seller",
    buyerAlias: "買01",
    sellerAlias: "売01",
    buyerUnit: 0,
    sellerUnit: 0,
  };
}

function metric(
  fill: ReturnType<typeof trade>,
  institutionPeriod: number,
): StudyMetric {
  return {
    market: fill.market,
    institution: fill.institution,
    round: fill.round,
    institutionPeriod,
    completion: "complete",
    quantity: 1,
    quantityRatio: 1,
    mean: fill.price,
    deviation: 0,
    alpha: 0,
    surplus: 0,
    commissionPaid: 0,
    efficiency: 0,
    inefficientTrades: 0,
    spread: null,
    spreadObservedMs: 0,
  };
}

test("each institution combines all markets into one chart and one table, sorted by market and period", () => {
  const session = new DemoSession("cda", "buyer", 1000, { teacher: true });
  const view = structuredClone(session.getSnapshot().view);
  view.config.studyPeriods = { cda: 2, call: 3, posted: 4 };
  view.config.rounds = 9;
  const teacher = view.study!.teacher!;
  const source = teacher.markets[0];
  teacher.markets = [
    {
      ...source,
      id: 10,
      order: ["call", "cda", "posted"],
      institution: "cda",
      round: 4,
      trades: [
        trade(10, "call", 1, 999),
        trade(10, "cda", 5, 110),
        trade(10, "cda", 4, 112),
      ],
    },
    {
      ...source,
      id: 1,
      order: ["posted", "call", "cda"],
      institution: "call",
      round: 5,
      trades: [trade(1, "posted", 1, 777), trade(1, "call", 5, 130)],
    },
    {
      ...source,
      id: 2,
      order: ["cda", "call", "posted"],
      institution: "cda",
      round: 1,
      trades: [trade(2, "cda", 1, 80)],
    },
  ];
  teacher.metrics = teacher.markets.flatMap((market) =>
    market.trades.map((fill) => metric(fill, fill.price === 110 ? 2 : 1)),
  );
  const html = renderToStaticMarkup(
    createElement(StudyAllMarketResults, { view }),
  );
  const cdaStart = html.indexOf('aria-label="CDAの市場別結果"');
  const callStart = html.indexOf('aria-label="Call Marketの市場別結果"');
  const postedStart = html.indexOf('aria-label="Posted Offerの市場別結果"');
  assert.ok(cdaStart >= 0 && callStart > cdaStart && postedStart > callStart);
  const cda = html.slice(cdaStart, callStart);
  const call = html.slice(callStart, postedStart);
  const posted = html.slice(postedStart);
  for (const section of [cda, call, posted]) {
    assert.equal((section.match(/<svg[^>]*role="img"/g) ?? []).length, 1);
    assert.equal((section.match(/<table /g) ?? []).length, 1);
    const legend = section.match(
      /<ul class="price-chart-legend"[\s\S]*?<\/ul>/,
    )![0];
    assert.deepEqual(
      [...legend.matchAll(/市場(\d+)/g)].map((match) => Number(match[1])),
      [1, 2, 10],
    );
    const table = section.match(/<table [\s\S]*?<\/table>/)![0];
    assert.match(table, /<th>市場<\/th><th>制度内の期<\/th>/);
    assert.deepEqual(
      [...table.matchAll(/<tr><td>市場(\d+)<\/td>/g)].map((match) =>
        Number(match[1]),
      ),
      section === cda ? [1, 2, 10, 10] : [1, 2, 10],
    );
  }
  assert.match(cda, /市場10・第2期：110円/);
  assert.match(cda, /市場10・第1期：112円/);
  assert.match(cda, /市場2・第1期：80円/);
  assert.ok(
    cda.indexOf("<td>市場10</td><td>1</td>") <
      cda.indexOf("<td>市場10</td><td>2</td>"),
  );
  assert.doesNotMatch(cda, /(?:130|999|777)円|<td>(?:130|999|777)<\/td>/);
  assert.match(call, /第1期：130円/);
  assert.match(call, /第1期：999円/);
  assert.match(call, /<td>999<\/td>/);
  assert.doesNotMatch(
    call,
    /(?:110|112|80|777)円|<td>(?:110|112|80|777)<\/td>/,
  );
  assert.match(posted, /第1期：777円/);
  assert.match(posted, /<td>777<\/td>/);
  assert.doesNotMatch(
    posted,
    /(?:110|112|80|130|999)円|<td>(?:110|112|80|130|999)<\/td>/,
  );
  assert.equal((html.match(/class="chart-dot"/g) ?? []).length, 6);
  assert.deepEqual(
    teacher.markets.map((market) => market.id),
    [10, 1, 2],
  );
});

test("student views cannot render all-market teacher results", () => {
  const session = new DemoSession("cda", "buyer", 1000);
  assert.equal(
    renderToStaticMarkup(
      createElement(StudyAllMarketResults, {
        view: session.getSnapshot().view,
      }),
    ),
    "",
  );
});
