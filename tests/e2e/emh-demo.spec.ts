import { expect, test } from "@playwright/test";

test("EMH Demo shares formal settings and confirms or releases them before trading", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      new URL(request.url()).pathname.startsWith("/api/")
    )
      writes.push(request.url());
  });
  await page.goto("/emh/demo");
  await expect(
    page.getByRole("heading", { name: "EMH · 資産市場実験" }),
  ).toBeVisible();
  await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel("教員パスワード", { exact: false })).toHaveCount(
    0,
  );
  await expect(page.locator('[name="initialUnits"]')).toHaveValue("2");
  await expect(page.locator('[name="periodMinutes"]')).toHaveValue("4");
  await page.locator('[name="initialUnits"]').fill("5");
  await page.locator('[name="targetMarketSize"]').fill("8");
  await page.locator('[name="typeRatio1"]').fill("2");
  await page.locator('[name="periodMinutes"]').fill("1.5");
  await page
    .getByRole("button", { name: "デモルームを作成", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "8人が入室", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".emh-allocation")).toContainText("4 / 2 / 2");
  await expect(page.locator(".emh-allocation")).toContainText(
    "総証券数 40単位",
  );
  const assign = page.getByRole("button", {
    name: "分け方を確定して受付終了",
    exact: true,
  });
  await page.locator('[name="initialUnits"]').fill("6");
  await expect(assign).toBeDisabled();
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(page.locator(".emh-allocation")).toContainText(
    "総証券数 48単位",
  );
  await assign.click();
  await expect(page.locator(".emh-settings-summary")).toContainText(
    "1人 6単位",
  );
  await expect(page.locator(".emh-settings-summary")).toContainText("90秒");
  await expect(page.locator('[name="initialUnits"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "割り当てを解除", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "解除して受付再開", exact: true })
    .click();
  await page.locator('[name="targetMarketSize"]').fill("12");
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "12人が入室", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".emh-allocation")).toContainText("6 / 3 / 3");
  await expect(page.locator(".emh-allocation")).toContainText(
    "総証券数 72単位",
  );
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await assign.click();
  await page
    .locator(".emh-session-settings")
    .screenshot({ path: info.outputPath("demo-locked-conditions.png") });
  await page
    .getByRole("button", { name: "全市場で実験を開始", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "割り当てを解除", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await page.getByRole("button", { name: "学生画面", exact: true }).click();
  await expect(page.locator(".stat-grid")).toContainText("円");
  for (const dividend of await page.locator(".stat-grid .private-stat").all()) {
    await expect(dividend).toContainText("円");
  }
  await expect(page.locator(".price-entry .input-yen")).toHaveText("円");
  await expect(
    page.getByText("一時停止中", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".emh-session-settings")).toHaveCount(0);
  await page.getByRole("button", { name: "教員画面", exact: true }).click();
  await expect(page.locator(".emh-settings-summary")).toContainText("90秒");
  await page.getByRole("button", { name: "設定を見直す", exact: true }).click();
  await expect(page.locator('[name="initialUnits"]')).toHaveValue("6");
  await expect(page.locator('[name="targetMarketSize"]')).toHaveValue("12");
  await expect(page.locator('[name="periodMinutes"]')).toHaveValue("1.5");
  await page.reload();
  await expect(page.locator('[name="initialUnits"]')).toHaveValue("2");
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("Exp2 demo runs a fixed 12-person market with practice information", async ({
  page,
}) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      new URL(request.url()).pathname.startsWith("/api/")
    )
      writes.push(request.url());
  });
  await page.goto("/emh/demo");
  await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
  await expect(page.locator('[name="initialUnits"]')).toHaveCount(0);
  await page.getByLabel("各ラウンドの時間（分）").fill("3");
  await page.getByLabel("ラウンド数").fill("3");
  await page.getByLabel("1取引の時間（秒）").fill("15");
  await page.getByLabel("休憩時間（秒）").fill("45");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await expect(page.getByRole("heading", { name: "12人が入室" })).toBeVisible();
  await expect(page.locator(".emh-allocation")).toContainText("4 / 4 / 4");
  await expect(page.getByLabel("ラウンド数")).toHaveValue("3");
  await expect(page.getByLabel("1取引の時間（秒）")).toHaveValue("15");
  await expect(page.getByLabel("休憩時間（秒）")).toHaveValue("45");
  await page.getByLabel("休憩時間（秒）").fill("40");
  await page.getByRole("button", { name: "設定を保存" }).click();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await expect(page.locator(".emh-settings-summary")).toContainText("180秒");
  await expect(page.locator(".emh-settings-summary")).toContainText("3回");
  await expect(page.locator(".emh-settings-summary")).toContainText("15秒");
  await expect(page.locator(".emh-settings-summary")).toContainText("40秒");
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  const conditions = page.getByRole("button", {
    name: "実験条件",
    exact: true,
  });
  await expect(conditions).toHaveAttribute("aria-expanded", "false");
  await conditions.click();
  await expect(page.locator("#demo-conditions")).toContainText("180秒");
  await conditions.click();
  await expect(page.locator("#demo-conditions")).toHaveCount(0);
  await page.getByRole("button", { name: "学生画面" }).click();
  await expect(page.getByText("Clue カード")).toBeVisible();
  await expect(page.getByText("情報なし")).toBeVisible();
  await expect(page.getByText("状態別の配当 / 確率")).toBeVisible();
  await expect(page.locator(".exp2-state-values > div")).toHaveCount(3);
  for (const state of await page.locator(".exp2-state-values > div").all()) {
    await expect(state).toContainText("円");
    await expect(state).toContainText("%");
  }
  await expect(
    page.getByRole("heading", { name: "取引価格（円）" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "あなたの記録" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "市場" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "注文板" })).toBeVisible();
  const buyColumn = page.locator(".exp2-action-column.buy-side");
  const sellColumn = page.locator(".exp2-action-column.sell-side");
  await expect(buyColumn).toContainText("最低売値");
  await expect(buyColumn.getByLabel("買値（円）")).toBeVisible();
  await expect(sellColumn).toContainText("最高買値");
  await expect(sellColumn.getByLabel("売値（円）")).toBeVisible();
  expect((await buyColumn.boundingBox())!.x).toBeLessThan(
    (await sellColumn.boundingBox())!.x,
  );
  await page.getByLabel("買値（円）", { exact: true }).fill("1");
  await page.getByLabel("売値（円）", { exact: true }).fill("99999");
  await page.getByRole("button", { name: "買値を提示" }).click();
  await expect(page.locator(".quote-card.bid")).toContainText("（あなた）");
  await expect(page.locator(".quote-card.bid strong")).toContainText("円");
  await page.getByRole("button", { name: "売値を提示" }).click();
  await expect(page.locator(".quote-card.ask")).toContainText("（あなた）");
  await expect(page.locator(".quote-card.ask strong")).toContainText("円");
  await expect(
    buyColumn.getByRole("button", { name: "この価格で買う" }),
  ).toBeDisabled();
  await expect(
    sellColumn.getByRole("button", { name: "この価格で売る" }),
  ).toBeDisabled();
  await buyColumn.getByRole("button", { name: "買値を取り消す" }).click();
  await expect(
    buyColumn.getByRole("button", { name: "買値を取り消す" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "買値を提示" }).click();
  await sellColumn.getByRole("button", { name: "売値を取り消す" }).click();
  await expect(
    sellColumn.getByRole("button", { name: "売値を取り消す" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "売値を提示" }).click();
  await expect(page.getByLabel("買値（円）", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("売値（円）", { exact: true })).toHaveValue(
    "99999",
  );
  await page.getByRole("button", { name: "教員画面" }).click();
  const tabWidths = await page
    .getByRole("tablist", { name: "表示内容" })
    .getByRole("tab")
    .evaluateAll((tabs) =>
      tabs.map((tab) => tab.getBoundingClientRect().width),
    );
  expect(new Set(tabWidths).size).toBe(1);
  for (let round = 1; round <= 2; round++) {
    await page.getByRole("button", { name: "期を終了" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "配当を確定して進む" })
      .click();
    await page.getByRole("button", { name: "次へ", exact: true }).click();
  }
  await page.getByRole("button", { name: "学生画面" }).click();
  await expect(page.getByText("Clue カード")).toBeVisible();
  await expect(page.locator(".results-panel tbody tr")).toHaveCount(2);
  await expect(page.locator(".results-panel thead")).toContainText("円");
  for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const heading of await page.locator(".results-panel thead th").all()) {
      expect(
        await heading.evaluate(
          (element) => getComputedStyle(element).whiteSpace,
        ),
      ).toBe("nowrap");
    }
    for (const table of await page
      .locator(".exp2-student-market .table-scroll")
      .all()) {
      if (
        width <= 760 &&
        (await table.locator("xpath=..").getAttribute("class"))?.includes(
          "results-panel",
        )
      )
        continue;
      expect(
        await table.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
    }
  }
  await page.getByRole("button", { name: "設定を見直す" }).click();
  await expect(page.getByRole("combobox", { name: "実験" })).toHaveValue(
    "exp2",
  );
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});

test("student views use three font sizes and equal state dividend and probability sizes", async ({
  page,
}) => {
  for (const experiment of ["exp1", "exp2"]) {
    await page.goto("/emh/demo");
    if (experiment === "exp2")
      await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
    await page.getByRole("button", { name: "デモルームを作成" }).click();
    await page
      .getByRole("button", { name: "分け方を確定して受付終了" })
      .click();
    await page.getByRole("button", { name: "全市場で実験を開始" }).click();
    await page.getByRole("button", { name: "停止", exact: true }).click();
    await page.getByRole("button", { name: "学生画面" }).click();
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const sizes = await page.locator(".emh-student-view").evaluate((root) => {
        const values = new Set<string>();
        for (const element of [root, ...root.querySelectorAll("*")]) {
          if (
            element.getClientRects().length === 0 ||
            getComputedStyle(element).visibility !== "visible"
          )
            continue;
          if (
            Array.from(element.childNodes).some(
              (node) =>
                node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            )
          ) {
            values.add(getComputedStyle(element).fontSize);
          }
        }
        return [...values].sort();
      });
      expect(sizes).toEqual(["12px", "16px", "24px"]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (experiment === "exp2") {
        for (const state of await page
          .locator(".exp2-state-values > div")
          .all()) {
          const dividend = await state
            .locator("strong")
            .evaluate((el) => getComputedStyle(el).fontSize);
          const probability = await state
            .locator("small")
            .evaluate((el) => getComputedStyle(el).fontSize);
          expect(dividend).toBe(probability);
          const metrics = await state.evaluate((element) => {
            const labels = [
              ...element.querySelectorAll(".exp2-state-line > span"),
            ];
            const values = [
              ...element.querySelectorAll(
                ".exp2-state-line > strong, .exp2-state-line > small",
              ),
            ];
            return {
              tops: labels.map((label) => label.getBoundingClientRect().top),
              colors: values.map((value) => getComputedStyle(value).color),
            };
          });
          expect(
            Math.abs(metrics.tops[0] - metrics.tops[1]),
          ).toBeLessThanOrEqual(1);
          expect(metrics.colors[0]).toBe(metrics.colors[1]);
        }
      }
    }
  }
});
