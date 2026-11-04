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
    await page.getByRole("link", { name: "戻る", exact: true }).click();
    await expect(page).toHaveURL(/\/demo\/select$/);
  }
  await page.goto("/teacher");
  await enterTeacherPage(page);
  await expect(
    page.getByRole("link", { name: "Demo Model", exact: true }),
  ).toHaveAttribute("href", "/demo/select");
  await expect(
    page.getByRole("link", { name: "戻る", exact: true }),
  ).toHaveCount(0);
  for (const experiment of ["institutions", "emh", "judgment"]) {
    await page.goto(`/teacher?experiment=${experiment}`);
    await expect(
      page.getByRole("link", { name: "戻る", exact: true }),
    ).toHaveAttribute("href", "/teacher");
    await page.getByRole("link", { name: "戻る", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher$/);
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
  const formalAccent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--formal-accent")
      .trim(),
  );
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
  await assertBadge("header .header-left .demo-header-tag", "DEMOモード");
  await expect(
    page.getByRole("link", { name: "DEMOモードを終了" }),
  ).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "DEMOモードを終了" })).toHaveCSS(
    "background-color",
    "rgb(84, 86, 199)",
  );
  expect(formalAccent).toBe("#5456c7");
  for (const [path, create] of [
    ["/demo", "ルーム作成"],
    ["/emh/demo", "デモルームを作成"],
  ]) {
    await page.goto(path);
    await assertBadge("header .header-left .demo-header-tag", "DEMOモード");
    await expect(
      page.getByRole("link", { name: "DEMOモードを終了" }),
    ).toHaveAttribute("href", "/");
    await expect(
      page.getByRole("button", { name: create, exact: true }),
    ).toHaveCSS("background-color", colors.background);
    await page.getByRole("button", { name: create, exact: true }).click();
    await assertBadge("header .header-left .demo-header-tag", "DEMOモード");
    await page.getByRole("button", { name: "学生画面を見る" }).click();
    if (path === "/emh/demo") {
      await expect(
        page.getByRole("link", { name: "教員用ページへ" }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "教員画面を見る" }).click();
      await expect(
        page.getByRole("link", { name: "教員用ページへ" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "学生画面を見る" }).click();
    }
    await assertBadge("header .header-left .demo-header-tag", "DEMOモード");
  }
  await page.goto("/judgment/demo");
  await assertBadge("header .demo-header-tag", "DEMOモード");
  await page.getByRole("button", { name: "すべて選択" }).click();
  await page.getByRole("button", { name: "デモを開始" }).click();
  await expect(page.getByRole("dialog", { name: "DEMOモード" })).toBeVisible();
  await assertBadge(
    ".judgment-preview header .header-left .demo-header-tag",
    "DEMOモード",
  );
  await page.getByRole("button", { name: "実験設定に戻る" }).click();
  await page
    .getByRole("combobox", { name: "言語 / 语言 / Language" })
    .selectOption("en");
  await assertBadge("header .demo-header-tag", "Demo mode");
  await page.getByRole("button", { name: "Start demo" }).click();
  await expect(page.getByRole("dialog", { name: "Demo mode" })).toBeVisible();
  await assertBadge(
    ".judgment-preview header .header-left .demo-header-tag",
    "Demo mode",
  );
  await page
    .getByRole("button", { name: "Back to experiment settings" })
    .click();
  await page
    .getByRole("combobox", { name: "言語 / 语言 / Language" })
    .selectOption("zh");
  await assertBadge("header .demo-header-tag", "演示模式");
  await page.getByRole("button", { name: "开始 Demo" }).click();
  await expect(page.getByRole("dialog", { name: "演示模式" })).toBeVisible();
  await assertBadge(
    ".judgment-preview header .header-left .demo-header-tag",
    "演示模式",
  );
});

test("demo exit uses the formal color and returns to the student entry", async ({
  page,
}) => {
  for (const path of [
    "/demo/select",
    "/demo",
    "/emh/demo",
    "/judgment/demo",
    "/demo/preview",
    "/emh/demo/preview",
  ]) {
    await page.goto(path);
    const exit = page.getByRole("link", {
      name: "DEMOモードを終了",
      exact: true,
    });
    await expect(exit).toHaveCSS("background-color", "rgb(84, 86, 199)");
    await exit.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("form", { name: "実験に参加する" }),
    ).toBeVisible();
  }
});

for (const path of ["/demo/preview", "/emh/demo/preview"]) {
  test(`demo selection navigates the whole page from ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(
      page.getByRole("link", { name: "DEMOモードを終了" }),
    ).toHaveAttribute("href", "/");
    const frame = page.frameLocator('iframe[title="操作できるひとりデモ"]');
    await frame.getByRole("link", { name: "戻る", exact: true }).click();
    await expect(page).toHaveURL(/\/demo\/select$/);
    await expect(
      page.getByRole("heading", { name: "デモする実験を選ぶ" }),
    ).toBeVisible();
  });
}
