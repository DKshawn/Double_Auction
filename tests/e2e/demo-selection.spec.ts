import { expect, test } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";

const demos = [
  {
    title: "Double Auction",
    url: /\/demo$/,
    heading: "DEMOモード · 教員の実験設定",
  },
  {
    title: "Efficient Market Hypothesis",
    url: /\/emh\/demo$/,
    heading: "EMH · 資産市場実験",
  },
  {
    title: "Judgement under Uncertainty",
    url: /\/judgment\/demo$/,
    heading: "Judgement under Uncertainty",
  },
];

test("home and teacher hub share one demo selection, without experiment-specific launch buttons", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("link", { name: "Demo Model", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/select$/);
  await expect(
    page.getByRole("heading", { name: "デモする実験を選ぶ" }),
  ).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  for (const demo of demos) {
    await page.getByRole("link", { name: new RegExp(demo.title) }).click();
    await expect(page).toHaveURL(demo.url);
    await expect(
      page.getByRole("heading", { name: demo.heading, exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "デモを選び直す" }).click();
    await expect(page).toHaveURL(/\/demo\/select$/);
  }
  await page.goto("/teacher");
  await enterTeacherPage(page);
  await expect(
    page.getByRole("link", { name: "Demo Model", exact: true }),
  ).toHaveAttribute("href", "/demo/select");
  for (const experiment of ["institutions", "emh", "judgment"]) {
    await page.goto(`/teacher?experiment=${experiment}`);
    await expect(
      page.getByRole("link", { name: "Demo Model", exact: true }),
    ).toHaveCount(0);
  }
});

test("demo mode badges match the shared entry color in every experiment and view", async ({
  page,
}) => {
  await page.goto("/");
  const colors = await page
    .getByRole("link", { name: "Demo Model" })
    .evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
    }));
  const assertBadge = async (selector: string, label: string) => {
    const badge = page.locator(selector);
    await expect(badge).toHaveText(label);
    await expect(badge).toHaveCSS("background-color", colors.background);
    await expect(badge).toHaveCSS("color", colors.color);
  };
  await page.goto("/demo/select");
  await assertBadge("header .demo-header-tag", "DEMOモード");
  for (const [path, create] of [
    ["/demo", "ルーム作成"],
    ["/emh/demo", "デモルームを作成"],
  ]) {
    await page.goto(path);
    await assertBadge("header .demo-header-tag", "DEMOモード");
    await page.getByRole("button", { name: create, exact: true }).click();
    await assertBadge(".demo-panel .demo-header-tag", "DEMOモード");
    await page.getByRole("button", { name: "学生画面を見る" }).click();
    await assertBadge(".demo-panel .demo-header-tag", "DEMOモード");
  }
  await page.goto("/judgment/demo");
  await assertBadge("header .demo-header-tag", "DEMOモード");
  await page.getByRole("button", { name: "すべて選択" }).click();
  await page.getByRole("button", { name: "デモを開始" }).click();
  await expect(page.getByRole("dialog", { name: "DEMOモード" })).toBeVisible();
  await assertBadge(".judgment-preview-toolbar .demo-header-tag", "DEMOモード");
  await page.getByRole("button", { name: "実験設定に戻る" }).click();
  await page
    .getByRole("combobox", { name: "言語 / 语言 / Language" })
    .selectOption("en");
  await assertBadge("header .demo-header-tag", "Demo mode");
  await page.getByRole("button", { name: "Start demo" }).click();
  await expect(page.getByRole("dialog", { name: "Demo mode" })).toBeVisible();
  await assertBadge(".judgment-preview-toolbar .demo-header-tag", "Demo mode");
  await page
    .getByRole("button", { name: "Back to experiment settings" })
    .click();
  await page
    .getByRole("combobox", { name: "言語 / 语言 / Language" })
    .selectOption("zh");
  await assertBadge("header .demo-header-tag", "演示模式");
  await page.getByRole("button", { name: "开始 Demo" }).click();
  await expect(page.getByRole("dialog", { name: "演示模式" })).toBeVisible();
  await assertBadge(".judgment-preview-toolbar .demo-header-tag", "演示模式");
});

for (const path of ["/demo/preview", "/emh/demo/preview"]) {
  test(`demo selection navigates the whole page from ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    const frame = page.frameLocator('iframe[title="操作できるひとりデモ"]');
    await frame.getByRole("link", { name: "デモを選び直す" }).click();
    await expect(page).toHaveURL(/\/demo\/select$/);
    await expect(
      page.getByRole("heading", { name: "デモする実験を選ぶ" }),
    ).toBeVisible();
  });
}
