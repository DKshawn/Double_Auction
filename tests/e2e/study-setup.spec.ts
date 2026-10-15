import { expect, test } from "@playwright/test";

test("pre-creation settings use a separate dialog with save and close", async ({
  page,
}) => {
  await page.goto("/teacher");
  const open = page.getByRole("button", {
    name: "作成前に詳細を設定",
    exact: true,
  });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "実験の詳細設定",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
  await expect(
    dialog
      .getByRole("group", { name: "CDA", exact: true })
      .getByLabel("CDA：1期の取引時間（秒）", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("CDAの期数", { exact: true }).fill("0");
  const next = dialog.getByRole("button", {
    name: "確定して次へ",
    exact: true,
  });
  await expect(next).toBeDisabled();
  await dialog.getByLabel("CDAの期数", { exact: true }).fill("3");
  await next.click();
  await expect(dialog.getByLabel("CDAの期数", { exact: true })).toBeHidden();
  await expect(
    dialog.locator('.study-setup-step-toggle[aria-expanded="true"]'),
  ).toContainText("市場・単位数");
  await next.click();
  const save = dialog.getByRole("button", {
    name: "設定を保存して閉じる",
    exact: true,
  });
  await save.click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByLabel("この実験の教員パスワード", { exact: false }),
  ).toBeVisible();
  await open.click();
  await expect(dialog.getByLabel("CDAの期数", { exact: true })).toHaveValue(
    "3",
  );
  await dialog.getByLabel("CDAの期数", { exact: true }).fill("9");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await open.click();
  await expect(dialog.getByLabel("CDAの期数", { exact: true })).toHaveValue(
    "3",
  );
  await next.click();
  await next.click();
  await dialog
    .getByRole("combobox", { name: "供需プリセット", exact: true })
    .selectOption("overlap");
  await dialog
    .getByRole("button", { name: "生成してプレビュー", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "この条件を確認して採用", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: /供需条件.*変更/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    dialog.getByRole("heading", { name: "カスタムのプレビュー", exact: true }),
  ).toBeHidden();
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await open.click();
  await dialog.getByRole("button", { name: /供需条件.*変更/ }).click();
  await expect(
    dialog.getByRole("heading", { name: "カスタムのプレビュー", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "条件を変更", exact: true }),
  ).toBeEnabled();
});

test("demo carries saved dialog settings into the same compact room controls", async ({
  page,
}) => {
  await page.goto("/demo");
  const open = page.getByRole("button", {
    name: "作成前に詳細を設定",
    exact: true,
  });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "実験の詳細設定",
    exact: true,
  });
  await dialog.getByLabel("CDAの期数", { exact: true }).fill("3");
  await dialog
    .getByLabel("CDA：1期の取引時間（秒）", { exact: true })
    .fill("90");
  await dialog
    .getByRole("checkbox", { name: "Call Market", exact: true })
    .uncheck();
  await dialog
    .getByRole("checkbox", { name: "Posted Offer", exact: true })
    .uncheck();
  await expect(
    dialog.getByLabel("Call Marketの期数", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByLabel("Posted Offer：売り手の価格提示（秒）", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "確定して次へ", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Call Marketの1人あたりの単位数", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "確定して次へ", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "設定を保存して閉じる", exact: true })
    .click();
  await page
    .getByRole("button", { name: "デモルームを作成", exact: true })
    .click();
  const setup = page.getByRole("region", { name: "実験の準備", exact: true });
  await expect(
    setup.locator('.study-setup-step-toggle[aria-expanded="true"]'),
  ).toContainText("入室締切");
  await expect(
    page.getByRole("region", { name: /^学生の割り当て/ }),
  ).toBeVisible();
  await expect(page.locator(".study-roster-market-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await setup.getByRole("button", { name: /制度と進行.*変更/ }).click();
  await expect(setup.getByLabel("CDAの期数", { exact: true })).toHaveValue("3");
  await expect(
    setup.getByLabel("CDA：1期の取引時間（秒）", { exact: true }),
  ).toHaveValue("90");
  await setup
    .getByRole("button", { name: "確定して次へ", exact: true })
    .click();
  await expect(
    setup.locator('.study-setup-step-toggle[aria-expanded="true"]'),
  ).toContainText("入室締切");
});

test("teacher entry tabs keep the same navigation geometry", async ({
  page,
}) => {
  await page.goto("/teacher");
  const positions = [];
  for (const name of ["教員として再入室", "新しい実験", "ルーム管理"]) {
    await page.getByRole("button", { name, exact: true }).click();
    const tabs = page.locator(".teacher-form-card.panel > .segmented");
    await expect(tabs).toBeVisible();
    positions.push(await tabs.boundingBox());
  }
  expect(positions[1]).toEqual(positions[0]);
  expect(positions[2]).toEqual(positions[0]);
});

test("shared preparation flow validates, advances, closes admission and preserves earlier settings", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "デモルームを作成", exact: true })
    .click();
  const expanded = page.locator(
    '.study-setup-step-toggle[aria-expanded="true"]',
  );
  const next = page.getByRole("button", { name: "確定して次へ", exact: true });
  await expect(expanded).toHaveCount(1);
  await expect(expanded).toContainText("制度と進行");
  await page.getByLabel("CDAの期数", { exact: true }).fill("0");
  await expect(next).toBeDisabled();
  await page.getByLabel("CDAの期数", { exact: true }).fill("3");
  await page
    .getByLabel("Call Market：1回の注文受付（秒）", { exact: true })
    .fill("5");
  await next.click();
  await expect(expanded).toHaveCount(1);
  await expect(expanded).toContainText("市場・取引条件");
  await page.getByLabel("希望する市場数", { exact: true }).fill("3");
  await expect(page.locator(".study-roster-room")).toHaveCount(3);
  await next.click();
  await expect(expanded).toContainText("入室締切");
  await page.getByLabel("入室受付時間（秒）", { exact: true }).fill("5");
  await page
    .getByRole("button", { name: "締切タイマーを開始", exact: true })
    .click();
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    "入室締切まで",
  );
  await expect(expanded).toContainText("割り当て確認", { timeout: 15_000 });
  await expect(expanded).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "実験を開始", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /制度と進行.*変更/ }).click();
  await expect(page.getByLabel("CDAの期数", { exact: true })).toHaveValue("3");
  await expect(
    page.getByLabel("Call Market：1回の注文受付（秒）", { exact: true }),
  ).toHaveValue("5");
  await page.getByLabel("CDAの期数", { exact: true }).fill("4");
  await next.click();
  await expect(expanded).toContainText("割り当て確認");
  await expect(page.locator(".study-setup-summary")).toContainText("3市場");
  await expect(page.locator(".study-setup-summary")).toContainText("CDA 4期");
  await page.getByRole("button", { name: /入室締切.*変更/ }).click();
  await expect(expanded).toContainText("入室締切");
  await page
    .getByRole("button", { name: "割り当て確認へ", exact: true })
    .click();
  await page.getByRole("button", { name: "実験を開始", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "全市場を一時停止", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "実験の準備", exact: true }),
  ).toBeHidden();
});
