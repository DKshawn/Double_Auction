import { expect, test } from "@playwright/test";

test("teacher can create and reenter a room with an eight-digit password without a status request", async ({
  page,
  browser,
  baseURL,
}) => {
  // A separate configuration request must not leave this form disabled.
  await page.route("**/api/status", (route) => route.abort("failed"));
  await page.goto("/teacher");
  await page.getByRole("button", { name: "教員として再入室" }).click();
  await expect(page.getByLabel("ルームコード", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新しい実験" }).click();
  await page
    .getByLabel("実験名", { exact: true })
    .fill("教員フォームの動作確認");
  await page
    .getByLabel("この実験の教員パスワード", { exact: false })
    .fill("12345678");
  const create = page.getByRole("button", { name: "実験ルームを作成" });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
  await expect(
    page.getByRole("button", { name: "実験を開始", exact: true }),
  ).toBeVisible();
  const code = page.url().split("/").at(-1)!;
  const response = await page.request.get(`/api/rooms/${code}`);
  expect(response.ok()).toBe(true);
  const snapshot = await response.json();
  expect(snapshot.me.role).toBe("teacher");
  expect(snapshot.config.capacity).toBe(16);
  expect(snapshot.study.protocol).toBe("institutions-v1");

  const returningTeacher = await browser.newContext({ baseURL });
  try {
    const reentry = await returningTeacher.newPage();
    await reentry.goto(`/teacher?code=${code}`);
    await reentry
      .getByLabel("この実験の教員パスワード", { exact: false })
      .fill("12345678");
    await reentry.getByRole("button", { name: "管理画面に入る" }).click();
    await expect(reentry).toHaveURL(`/room/${code}`);
    await expect(
      reentry.getByRole("button", { name: "実験を開始", exact: true }),
    ).toBeVisible();
  } finally {
    await returningTeacher.close();
  }
});
