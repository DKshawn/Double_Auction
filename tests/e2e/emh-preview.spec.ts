import { expect, test } from "@playwright/test";

test("EMH screen-size preview keeps the same interactive Exp2 session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const demoResponse = await page.request.get("/emh/demo");
  expect(demoResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(demoResponse.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'self'",
  );
  const teacherResponse = await page.request.get("/teacher");
  expect(teacherResponse.headers()["x-frame-options"]).toBe("DENY");

  await page.goto("/emh/demo/preview");
  const demo = page.frameLocator('iframe[title="操作できるひとりデモ"]');
  await demo.getByRole("combobox", { name: "実験" }).selectOption("exp2");
  await demo.getByRole("button", { name: "デモルームを作成" }).click();
  await demo.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await demo.getByRole("button", { name: "全市場で実験を開始" }).click();
  await demo.getByRole("button", { name: "停止", exact: true }).click();
  await demo.getByRole("button", { name: "学生画面" }).click();
  await page
    .getByRole("button", { name: "スマートフォン 390 × 844", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await expect(page.locator("iframe")).toHaveAttribute("height", "724");
  await expect(demo.getByRole("button", { name: "学生画面" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(demo.getByText("状態別の配当 / 確率")).toBeVisible();
  await expect(
    demo.getByRole("button", { name: "再開", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "1366 × 768 表示倍率 100%", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "1366");
  await expect(demo.getByRole("button", { name: "学生画面" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("Double Auction preview retains its embedded demo and supports narrow-screen selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/preview");
  const frame = page.frameLocator('iframe[title="操作できるひとりデモ"]');
  await expect(frame.locator("body")).not.toBeEmpty();
  await page
    .getByRole("combobox", { name: "画面サイズ", exact: true })
    .selectOption("2");
  await expect(page.locator("iframe")).toHaveAttribute("width", "1280");
  await expect(frame.locator("body")).not.toBeEmpty();
});
