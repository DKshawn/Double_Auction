import { expect, type Page } from "@playwright/test";
import { verificationTarget } from "../../../scripts/verification-target";

export async function enterTeacherPage(page: Page) {
  if (!new URL(page.url()).pathname.startsWith("/teacher/login")) return;
  const { accessKey } = verificationTarget("E2E_BASE_URL");
  await page.getByLabel("教員用キー", { exact: false }).fill(accessKey);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).not.toHaveURL(/\/teacher\/login/);
}
