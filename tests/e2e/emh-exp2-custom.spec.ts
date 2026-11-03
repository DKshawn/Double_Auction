import { expect, test, type BrowserContext } from "@playwright/test";
import { verificationTarget } from "../../scripts/verification-target";
import { enterTeacherPage } from "./helpers/teacher-login";

test("teacher configures Exp2 and allocates 11 students across two markets", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  let code: string | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/teacher?experiment=emh");
    await enterTeacherPage(page);
    await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
    await expect(page.locator('[name="initialUnits"]')).toHaveValue("2");
    await page.locator('[name="initialUnits"]').fill("4");
    await page.locator('[name="targetMarketSize"]').fill("6");
    await page.locator('[name="typeRatio1"]').fill("2");
    await page.getByLabel("ラウンド数").fill("3");
    await page.getByLabel("連続不成立で終了する回数").fill("3");
    await page.getByLabel("市場数（空欄は自動）").fill("2");
    await page.getByLabel("内部情報の開始ラウンド").fill("1");
    await page.getByLabel("内部情報を持つ人数（各タイプ）").fill("1");
    await page.getByText("状態・配当の設定", { exact: true }).click();
    await page.getByLabel("状態1", { exact: true }).fill("20");
    await page.getByLabel("状態2", { exact: true }).fill("30");
    await page.getByLabel("状態3", { exact: true }).fill("50");
    for (const [type, values] of [
      [1, [17, 19, 21]],
      [2, [27, 29, 31]],
      [3, [37, 39, 41]],
    ] as const)
      for (let state = 1; state <= 3; state++)
        await page
          .getByLabel(`タイプ${type}・状態${state}`, { exact: true })
          .fill(String(values[state - 1]));
    await page.getByRole("combobox", { name: "第1ラウンド" }).selectOption("3");
    await page
      .getByLabel("教員パスワード", { exact: false })
      .fill("Emh-Custom-Verification");
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: info.outputPath("emh-exp2-settings.png") });
    await page
      .getByRole("button", { name: "ルームを作成", exact: true })
      .click();
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]+\?entry=teacher/);
    code = new URL(page.url()).pathname.split("/")[2];
    const path = `/api/rooms/${code}`;
    for (let i = 0; i < 11; i++) {
      const ctx = await browser.newContext({ baseURL });
      contexts.push(ctx);
      const response = await ctx.request.post(`${path}/join`, {
        data: { nickname: `検証${i}`, pin: "1234" },
      });
      expect(response.ok(), await response.text()).toBe(true);
    }
    await expect(
      page.getByRole("heading", { name: "11人が入室" }),
    ).toBeVisible();
    await expect(page.locator(".emh-allocation")).toContainText("6人");
    await expect(page.locator(".emh-allocation")).toContainText("5人");
    await expect(page.locator(".emh-allocation")).toContainText(
      "内部情報の人数 1 / 1 / 1",
    );
    await page
      .getByRole("button", { name: "分け方を確定して受付終了" })
      .click();
    await expect(page.locator(".emh-settings-summary")).toContainText(
      "1人 4単位",
    );
    await expect(page.locator(".emh-settings-summary")).toContainText("3回");
    await page.getByRole("button", { name: "全市場で実験を開始" }).click();
    const exported = await (
      await page.request.get(
        `${path}/emh/export?session=teacher&kind=conditions`,
      )
    ).json();
    expect(exported.settings.exp2.states.prior).toEqual([0.2, 0.3, 0.5]);
    expect(exported.settings.exp2.states.dividends).toEqual([
      [17, 19, 21],
      [27, 29, 31],
      [37, 39, 41],
    ]);
    expect(exported.markets).toHaveLength(2);
    expect(exported.markets[0].conditions.config.states.outcomes[0]).toBe(3);
    expect(exported.markets[0].conditions.rules.maxEmptyUnits).toBe(3);
    const studentResponse = await contexts[0]!.request.get(
      `${path}/emh?session=student`,
    );
    expect(studentResponse.ok()).toBe(true);
    const student = (await studentResponse.json()).state;
    expect(student.settings).toBeNull();
    expect(student.market.exp2.allDividends).toBeNull();
    expect(student.market.exp2.prior).toEqual([0.2, 0.3, 0.5]);
    expect(student.market.initialUnits).toBe(4);
    expect(student.market.emptyUnitsLimit).toBe(3);
    expect(errors).toEqual([]);
  } finally {
    if (code) {
      const cleanup = await page.request.delete(`/api/rooms/${code}`, {
        data: {
          accessKey: verificationTarget("E2E_BASE_URL").accessKey,
          confirmed: true,
        },
      });
      expect.soft(cleanup.ok()).toBe(true);
    }
    for (const ctx of contexts) await ctx.close();
  }
});

test("Exp2 demo uses custom information and dividends", async ({ page }) => {
  await page.goto("/emh/demo");
  await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
  await page.locator('[name="initialUnits"]').fill("5");
  await page.locator('[name="targetMarketSize"]').fill("3");
  await page.getByLabel("連続不成立で終了する回数").fill("4");
  await page.getByLabel("内部情報の開始ラウンド").fill("1");
  await page.getByLabel("内部情報を持つ人数（各タイプ）").fill("1");
  await page.getByText("状態・配当の設定", { exact: true }).click();
  for (const [i, p] of [20, 30, 50].entries())
    await page.getByLabel(`状態${i + 1}`, { exact: true }).fill(String(p));
  for (let type = 1; type <= 3; type++)
    for (let state = 1; state <= 3; state++)
      await page
        .getByLabel(`タイプ${type}・状態${state}`, { exact: true })
        .fill(String(state * 10));
  await page.getByRole("combobox", { name: "第1ラウンド" }).selectOption("3");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await expect(page.getByRole("heading", { name: "3人が入室" })).toBeVisible();
  await expect(page.locator(".emh-allocation")).toContainText(
    "内部情報の人数 1 / 1 / 1",
  );
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  await expect(page.locator(".exp2-clue")).toContainText("状態 3");
  await expect(page.locator(".exp2-state-info")).toContainText("20%");
  await expect(page.locator(".exp2-state-info")).toContainText("30円");
  await expect(page.locator(".stat-grid")).toContainText("5");
  await page.getByRole("button", { name: "設定を見直す" }).click();
  await expect(page.locator('[name="initialUnits"]')).toHaveValue("5");
  await expect(page.getByLabel("連続不成立で終了する回数")).toHaveValue("4");
});
