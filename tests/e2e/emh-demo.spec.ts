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
