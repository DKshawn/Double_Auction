import { signInTeacher } from "./helpers/teacher-login";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await signInTeacher(page.request);
});

test("Double Auction and EMH demos share the student waiting card", async ({
  page,
}, info) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "ルーム作成", exact: true }).click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  const card = page.locator(".student-waiting-card");
  await expect(card).toContainText("入室が完了しました");
  await expect(card.locator(".student-waiting-icon")).toBeVisible();
  await expect(card.locator(".study-waiting-institutions")).toBeVisible();
  for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 1366)
      await card.screenshot({ path: info.outputPath("da-waiting.png") });
  }
  await page.goto("/emh/demo");
  await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  await expect(card).toContainText("入室が完了しました");
  await expect(card).toContainText("教員が受付を終了するまで");
  await expect(card.locator(".student-waiting-icon")).toBeVisible();
  for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 1366)
      await card.screenshot({ path: info.outputPath("emh-waiting.png") });
  }
});
