import { expect, test } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";

const demos = [
  {
    title: "Double Auction",
    url: /\/demo$/,
    heading: "ひとりデモ · 教員の実験設定",
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
