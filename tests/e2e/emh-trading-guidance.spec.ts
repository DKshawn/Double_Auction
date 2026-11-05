import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { verificationTarget } from "../../scripts/verification-target";
import {
  DEFAULT_SETTINGS,
  EXP2_SETTINGS,
} from "../../src/experiments/emh/settings";
import type { SessionView } from "../../src/experiments/emh/session-types";
import type { Action } from "../../src/experiments/emh/types";

for (const experiment of ["exp1", "exp2"] as const) {
  test(`${experiment} formal market explains immediate trades, protects identities and distinguishes final earnings`, async ({
    page,
    browser,
    baseURL,
  }, info) => {
    const { accessKey } = verificationTarget("E2E_BASE_URL");
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];
    let code: string | undefined;
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      expect(
        (
          await page.request.post("/api/teacher/session", {
            data: { accessKey },
          })
        ).ok(),
      ).toBe(true);
      const created = await page.request.post("/api/emh/rooms", {
        data: {
          title: "EMH trading guidance verification",
          password: "Guidance-check-only",
          experiment,
          settings: {
            ...structuredClone(
              experiment === "exp1" ? DEFAULT_SETTINGS : EXP2_SETTINGS,
            ),
            initialUnits: 1,
            targetMarketSize: 3,
            unitSeconds: 120,
            periodSeconds: 600,
            rounds: 1,
          },
        },
      });
      expect(created.ok(), await created.text()).toBe(true);
      code = (await created.json()).code;
      const path = `/api/rooms/${code}`;
      for (let index = 0; index < 3; index++) {
        const context = await browser.newContext({ baseURL });
        contexts.push(context);
        expect(
          (
            await context.request.post(`${path}/join`, {
              data: { nickname: `UI${index + 1}`, pin: "2468" },
            })
          ).ok(),
        ).toBe(true);
      }
      const state = async (
        request: APIRequestContext = page.request,
        role = "teacher",
      ): Promise<SessionView> => {
        const result = await request.get(`${path}/emh?session=${role}`);
        expect(result.ok()).toBe(true);
        return (await result.json()).state;
      };
      const session = async (kind: "assign" | "start") => {
        const response = await page.request.post(
          `${path}/emh?session=teacher`,
          {
            data: {
              scope: "session",
              requestId: randomUUID(),
              command: { kind, expectedRevision: (await state()).revision },
            },
          },
        );
        expect(response.ok(), await response.text()).toBe(true);
      };
      const send = async (
        request: APIRequestContext,
        role: string,
        action: Action,
      ) => {
        const result = await request.post(`${path}/emh?session=${role}`, {
          data: {
            scope: "market",
            marketId: 1,
            requestId: randomUUID(),
            action,
          },
        });
        expect(result.ok(), await result.text()).toBe(true);
        return (await result.json()).state as SessionView;
      };
      const quote = async (
        index: number,
        side: "bid" | "ask",
        price: number,
      ) => {
        const request = contexts[index]!.request;
        return send(request, "student", {
          kind: "quote",
          side,
          price,
          unitKey: (await state(request, "student")).market!.unitKey,
        });
      };
      const control = async (kind: "pause" | "resume" | "end-period") =>
        send(page.request, "teacher", {
          kind,
          expectedPhase: (await state()).market!.phaseKey,
        });
      await session("assign");
      await session("start");
      await expect
        .poll(async () => (await state()).market?.status)
        .toBe("trading");
      await page.goto(`/room/${code}?entry=teacher`);
      const student = await contexts[0]!.newPage();
      student.on("pageerror", (error) => errors.push(error.message));
      await student.goto(`/room/${code}`);
      const bid = student.getByLabel("買値（円）", { exact: true });
      const ask = student.getByLabel("売値（円）", { exact: true });
      const buy = student.locator(".buy-side");
      await expect(bid).toBeEnabled();
      await expect(student.locator(".market-note")).not.toContainText(
        "最初の提示",
      );
      await expect(student.locator(".history-panel .chart-wrap")).toHaveCount(
        0,
      );
      await expect(page.locator(".history-panel .chart-wrap")).toBeVisible();
      await expect(student.locator(".trading-clock-rule")).toContainText(
        "1取引につき1単位",
      );
      if (experiment === "exp1") {
        await expect(student.locator(".emh-conditions")).toContainText(
          "非公開",
        );
        await expect(student.locator(".emh-score-note")).toContainText(
          "B期末に確定",
        );
      }
      await bid.fill("100");
      await buy
        .getByRole("button", { name: "買い指値注文", exact: true })
        .click();
      await expect(buy.locator(".own-quote-status")).toContainText("有効");
      await quote(1, "bid", 101);
      await expect(buy.locator(".own-quote-status")).toContainText(
        "他の提示に更新済み",
      );
      const other = (await state(contexts[1]!.request, "student")).market!;
      await send(contexts[1]!.request, "student", {
        kind: "cancel",
        side: "bid",
        quoteId: other.bid!.id,
        unitKey: other.unitKey,
      });
      await expect(
        student
          .getByRole("region", { name: "買い注文一覧" })
          .locator(".study-empty"),
      ).toHaveText("まだ注文はありません");
      await bid.fill("99");
      await buy
        .getByRole("button", { name: "買い指値注文", exact: true })
        .click();
      await buy.getByRole("button", { name: "買値を取り消す" }).click();
      await student.reload();
      await expect(buy.locator(".own-quote-status")).toContainText("取消済み");
      await quote(1, "ask", 177);
      const standing = (await state(contexts[2]!.request, "student")).market!;
      expect(standing.ask!.participantId).toBeNull();
      expect(standing.ask!.seat).toBeNull();
      await expect(
        student.getByRole("region", { name: "売り注文一覧" }),
      ).toContainText("177");
      await bid.fill("180");
      await expect(buy.locator("#order-bid-outcome")).toContainText(
        "177円で1単位が即時成立",
      );
      await buy
        .getByRole("button", { name: "買い指値注文（即時成立）", exact: true })
        .click();
      await expect(student.locator(".personal-trade-feedback")).toContainText(
        "177円で買いました",
      );
      await expect(buy.locator(".own-quote-status")).toContainText("成立済み");
      const after = (await state(contexts[0]!.request, "student")).market!;
      expect(after.me!.holdings).toBe(2);
      expect(after.me!.cash).toBe(-177);
      expect(after.trades[0]!.sellerId).toBeNull();
      expect(after.trades[0]!.sellerSeat).toBeNull();
      const late = await contexts[2]!.request.post(
        `${path}/emh?session=student`,
        {
          data: {
            scope: "market",
            marketId: 1,
            requestId: randomUUID(),
            action: {
              kind: "accept",
              side: "ask",
              quoteId: standing.ask!.id,
              unitKey: standing.unitKey,
            },
          },
        },
      );
      expect(late.status()).toBe(409);
      expect((await state()).market!.trades).toHaveLength(1);
      for (const width of [1440, 390, 320]) {
        await student.setViewportSize({ width, height: 1000 });
        expect(
          await student.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await student.screenshot({
          path: info.outputPath(`${experiment}-student-${width}.png`),
          fullPage: true,
        });
      }
      for (let count = 0; count < 2; count++) {
        await quote(1, "bid", 100);
        await student
          .locator(".sell-side")
          .getByRole("button", { name: "売り成行注文", exact: true })
          .click();
        await expect
          .poll(
            async () =>
              (await state(contexts[0]!.request, "student")).market!.me!
                .holdings,
          )
          .toBe(1 - count);
      }
      await expect(ask).toBeDisabled();
      await expect(bid).toBeEnabled();
      await expect(
        student.locator(".sell-side #order-ask-outcome"),
      ).toContainText("保有0単位");
      await quote(1, "ask", 90);
      await quote(2, "bid", 90);
      await expect(
        student.getByRole("button", { name: "全体 4件", exact: true }),
      ).toBeVisible();
      await student
        .getByRole("button", { name: "自分の売買 3件", exact: true })
        .click();
      await expect(student.locator(".trade-table tbody tr")).toHaveCount(3);
      await expect(student.locator(".trade-table")).not.toContainText("UI2");
      const observerTrade = (
        await state(contexts[0]!.request, "student")
      ).market!.trades.at(-1)!;
      expect(observerTrade.buyerId).toBeNull();
      expect(observerTrade.sellerId).toBeNull();
      await control("pause");
      await expect(bid).toBeDisabled();
      await control("resume");
      await expect(bid).toBeEnabled();
      await control("end-period");
      if (experiment === "exp1") {
        await expect(student.locator(".score-status.provisional")).toHaveText(
          "暫定",
        );
        await quote(1, "ask", 100);
        await buy
          .getByRole("button", { name: "買い成行注文", exact: true })
          .click();
        await expect
          .poll(
            async () =>
              (await state(contexts[0]!.request, "student")).market!.me!
                .holdings,
          )
          .toBe(1);
        await control("end-period");
      }
      await expect(student.locator(".score-status.final")).toHaveText("確定");
      await expect(
        student.getByText("ラウンド確定得点", { exact: true }),
      ).toBeVisible();
      const final = (await state(contexts[0]!.request, "student")).market!;
      const expected =
        experiment === "exp1" ? -77 + final.me!.dividends!.b : 23;
      expect(final.me!.totalProfit).toBe(expected);
      expect(
        (
          await page.request.get(
            `${path}/emh/export?session=teacher&kind=trades`,
          )
        ).ok(),
      ).toBe(true);
      await student.reload();
      await expect(student.locator(".score-status.final")).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      if (code)
        expect(
          (
            await page.request.delete(`/api/rooms/${code}?session=teacher`, {
              data: { confirmed: true },
            })
          ).ok(),
        ).toBe(true);
      for (const context of contexts) await context.close();
    }
  });
}
