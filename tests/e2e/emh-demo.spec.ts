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
  await page
    .getByRole("region", { name: "ひとりデモの操作" })
    .getByRole("button", { name: "一時停止", exact: true })
    .click();
  await page
    .getByRole("button", { name: "学生画面を見る", exact: true })
    .click();
  await expect(page.locator(".stat-grid")).toContainText("円");
  for (const dividend of await page.locator(".stat-grid .private-stat").all()) {
    await expect(dividend).toContainText("円");
  }
  await expect(page.locator(".price-entry .input-yen")).toHaveText([
    "円",
    "円",
  ]);
  await expect(
    page.getByText("一時停止中", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".emh-session-settings")).toHaveCount(0);
  await page
    .getByRole("button", { name: "教員画面を見る", exact: true })
    .click();
  await page.getByRole("button", { name: "実験条件", exact: true }).click();
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

test("Exp2 demo runs the default 12-person market with practice information", async ({
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
  await expect(page.locator('[name="initialUnits"]')).toHaveValue("2");
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
  await page.getByRole("button", { name: "学生画面を見る" }).click();
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
  const buyColumn = page.locator(".student-action-column.buy-side");
  const sellColumn = page.locator(".student-action-column.sell-side");
  await expect(buyColumn).toContainText("最低売値");
  await expect(buyColumn.getByLabel("買値（円）")).toBeVisible();
  await expect(sellColumn).toContainText("最高買値");
  await expect(sellColumn.getByLabel("売値（円）")).toBeVisible();
  expect((await buyColumn.boundingBox())!.x).toBeLessThan(
    (await sellColumn.boundingBox())!.x,
  );
  await expect(page.getByLabel("買値（円）", { exact: true })).toBeEnabled({
    timeout: 12000,
  });
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
  await page.getByRole("button", { name: "教員画面を見る" }).click();
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
  await page.getByRole("button", { name: "学生画面を見る" }).click();
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
      .locator(".student-market-grid .table-scroll")
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

test("Exp1 student demo shows the trading board, prices and records together", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/emh/demo");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  for (const name of ["注文板", "取引価格（円）", "あなたの記録"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByRole("tab", { name: "市場" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "自分の記録" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "提示の種類" })).toHaveCount(0);
  await expect(page.getByLabel("買値（円）")).toBeVisible();
  await expect(page.getByLabel("売値（円）")).toBeVisible();
  const columns = await page
    .locator(".student-market-grid > *")
    .evaluateAll((elements) =>
      elements.map((el) => ({
        top: el.getBoundingClientRect().top,
        left: el.getBoundingClientRect().left,
      })),
    );
  expect(columns).toHaveLength(3);
  expect(
    Math.max(...columns.map((item) => item.top)) -
      Math.min(...columns.map((item) => item.top)),
  ).toBeLessThanOrEqual(1);
  expect(columns[0].left).toBeLessThan(columns[1].left);
  expect(columns[1].left).toBeLessThan(columns[2].left);
  for (const width of [1175, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByLabel("買値（円）")).toBeVisible();
    await expect(page.getByLabel("売値（円）")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "あなたの記録" }),
    ).toBeVisible();
  }
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
    await page
      .getByRole("region", { name: "ひとりデモの操作" })
      .getByRole("button", { name: "一時停止", exact: true })
      .click();
    await page.getByRole("button", { name: "学生画面を見る" }).click();
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

test("demo countdown displays private conditions before trading and can be paused", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/emh/demo");
  await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  await expect(page.getByText("開始まで", { exact: true })).toBeVisible();
  await expect(page.locator(".emh-countdown-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "期を終了" })).toBeDisabled();
  await page
    .getByRole("region", { name: "ひとりデモの操作" })
    .getByRole("button", { name: "一時停止", exact: true })
    .click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  const countdownCard = page.locator(".emh-countdown-card");
  await expect(countdownCard).toContainText("開始前に一時停止しています");
  await expect(countdownCard).toContainText(
    "教員が再開するまでお待ちください。",
  );
  const countdownValue = await countdownCard.locator("strong").textContent();
  const bounds = await countdownCard.boundingBox();
  expect(bounds).not.toBeNull();
  const conditionsBounds = await page.locator(".exp2-state-info").boundingBox();
  expect(conditionsBounds!.y + conditionsBounds!.height).toBeLessThanOrEqual(
    bounds!.y + 4,
  );
  expect(
    Math.abs(bounds!.x + bounds!.width / 2 - page.viewportSize()!.width / 2),
  ).toBeLessThan(1);
  expect(
    Math.abs(bounds!.y + bounds!.height / 2 - page.viewportSize()!.height / 2),
  ).toBeLessThan(1);
  await expect(page.getByText("状態別の配当 / 確率")).toBeVisible();
  await expect(page.getByLabel("買値（円）", { exact: true })).toBeDisabled();
  const clock = page.locator(".session-bar .timer");
  const pausedClock = await clock.textContent();
  await page.waitForTimeout(1100);
  await expect(clock).toHaveText(pausedClock!);
  await expect(countdownCard.locator("strong")).toHaveText(countdownValue!);
  await page.getByRole("button", { name: "再開", exact: true }).click();
  await expect(page.getByLabel("買値（円）", { exact: true })).toBeEnabled({
    timeout: 12000,
  });
  await expect(countdownCard).toHaveCount(0);
  await expect(page.getByText("期の残り", { exact: true })).toBeVisible();
});

test("Exp1 student countdown uses the centered DA card and clears when trading opens", async ({
  page,
}) => {
  await page.goto("/emh/demo");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  const card = page.locator(".emh-countdown-card");
  await expect(card).toContainText("まもなく実験が始まります");
  await expect(card.locator("strong")).toHaveText(/^[1-5]$/);
  await expect(page.locator(".study-start-countdown")).toHaveCSS(
    "pointer-events",
    "none",
  );
  await expect(page.getByLabel("買値（円）")).toBeDisabled();
  await expect(card).toHaveCount(0, { timeout: 12000 });
  await expect(page.getByLabel("買値（円）")).toBeEnabled();
});

test("EMH demo controls preserve the session while switching views, advancing and resetting", async ({
  page,
}) => {
  await page.goto("/emh/demo");
  await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
  await page.getByLabel("各ラウンドの時間（分）").fill("3");
  await page.getByLabel("1取引の時間（秒）").fill("100");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  const panel = page.getByRole("region", { name: "ひとりデモの操作" });
  await expect(
    panel.getByRole("button", { name: "30秒進める" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  await expect(panel.getByRole("button", { name: "次の期へ" })).toBeDisabled();
  await panel.getByRole("button", { name: "学生画面を見る" }).click();
  await expect(page.getByLabel("買値（円）", { exact: true })).toBeEnabled({
    timeout: 12000,
  });
  await panel.getByRole("button", { name: "一時停止" }).click();
  const pausedTime = await page
    .locator(".session-bar .timer")
    .first()
    .textContent();
  await panel.getByRole("button", { name: "教員画面を見る" }).click();
  await panel.getByRole("button", { name: "学生画面を見る" }).click();
  await expect(page.locator(".session-bar .timer").first()).toHaveText(
    pausedTime!,
  );
  await expect(
    panel.getByRole("button", { name: "30秒進める" }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "再開" }).click();
  await panel.getByRole("button", { name: "30秒進める" }).click();
  await expect(page.locator(".session-bar .timer").first()).toContainText(
    "02:2",
  );
  await panel.getByRole("button", { name: "次の期へ" }).click();
  await expect(
    page.getByText("第2ラウンド", { exact: true }).first(),
  ).toBeVisible();
  await panel.getByRole("button", { name: "やり直す" }).click();
  await panel.getByRole("button", { name: "教員画面を見る" }).click();
  await expect(page.getByRole("heading", { name: "12人が入室" })).toBeVisible();
  await expect(page.getByLabel("1取引の時間（秒）")).toHaveValue("100");
});
