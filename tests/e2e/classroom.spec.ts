import { test, expect, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { Command, RoomView } from "../../src/lib/types";

test("Japanese home, photographs, navigation and mobile layout", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(
    page.getByRole("form", { name: "実験に参加する" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((imgs) =>
          imgs.every(
            (i) =>
              i instanceof HTMLImageElement && i.complete && i.naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("home-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "実験のルール", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "取引を始める前に" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("12 independent students trade, recover, finish rounds and export with server-enforced privacy", async ({
  browser,
  page: teacherPage,
  baseURL,
}, info) => {
  const errors: string[] = [];
  teacherPage.on("pageerror", (e) => errors.push(e.message));
  await teacherPage.setViewportSize({ width: 1440, height: 1080 });
  await teacherPage.goto("/teacher?legacy=1");
  await teacherPage
    .getByLabel("実験名", { exact: true })
    .fill("市場と価格の実験");
  await teacherPage.getByLabel("ラウンド数", { exact: true }).fill("2");
  await teacherPage.getByLabel("1ラウンドの取引時間").selectOption("300");
  await teacherPage
    .getByLabel("この実験の教員パスワード", { exact: false })
    .fill("Classroom-test-only");
  await teacherPage.getByRole("button", { name: "実験ルームを作成" }).click();
  await expect(teacherPage).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
  const code = teacherPage.url().split("/").at(-1)!;
  await expect(
    teacherPage.getByRole("button", { name: "実験を開始", exact: true }),
  ).toBeDisabled();
  const apiPath = `/api/rooms/${code}`;
  const teacher = teacherPage.context();
  const snapshot = async (context: BrowserContext) => {
    const response = await context.request.get(apiPath);
    expect(response.status()).toBe(200);
    return (await response.json()) as RoomView;
  };
  const command = (context: BrowserContext, command: Command, round = 1) =>
    context.request.post(`${apiPath}/commands`, {
      data: { requestId: randomUUID(), expectedRound: round, command },
    });
  const contexts: BrowserContext[] = [];
  const students: { context: BrowserContext; view: RoomView }[] = [];
  try {
    for (let i = 0; i < 12; i++) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      if (i === 0) {
        const studentPage = await context.newPage();
        studentPage.on("pageerror", (e) => errors.push(e.message));
        await studentPage.goto(`/?code=${code}`);
        await studentPage
          .locator('input[name="nickname"]')
          .fill(`実験者${i + 1}`);
        await studentPage.locator('input[name="pin"]').fill("2468");
        await studentPage
          .getByRole("button", { name: "入室する", exact: true })
          .click();
        await expect(
          studentPage.getByRole("heading", { name: "取引ルーム", exact: true }),
        ).toBeVisible();
      } else {
        const joined = await context.request.post(`${apiPath}/join`, {
          data: { nickname: `実験者${i + 1}`, pin: "2468" },
        });
        expect(joined.status()).toBe(200);
      }
      students.push({ context, view: await snapshot(context) });
    }
    const buyers = students
      .filter((s) => s.view.me.role === "buyer")
      .sort((a, b) => b.view.me.limits!.apple - a.view.me.limits!.apple);
    const sellers = students
      .filter((s) => s.view.me.role === "seller")
      .sort((a, b) => a.view.me.limits!.apple - b.view.me.limits!.apple);
    expect(buyers).toHaveLength(6);
    expect(sellers).toHaveLength(6);
    await expect(
      teacherPage.getByRole("button", { name: "実験を開始", exact: true }),
    ).toBeEnabled();
    await teacherPage
      .getByRole("button", { name: "実験を開始", exact: true })
      .click();
    const buyerPage = await buyers[0].context.newPage();
    const sellerPage = await sellers[0].context.newPage();
    buyerPage.on("pageerror", (e) => errors.push(e.message));
    sellerPage.on("pageerror", (e) => errors.push(e.message));
    await buyerPage.setViewportSize({ width: 1440, height: 1080 });
    await Promise.all([
      buyerPage.goto(`/room/${code}`),
      sellerPage.goto(`/room/${code}`),
    ]);
    await sellerPage
      .getByRole("spinbutton", { name: "売りたい価格" })
      .fill("30");
    await sellerPage.getByRole("button", { name: "注文を出す" }).click();
    await expect(
      buyerPage.getByRole("button", { name: "30円で買う", exact: true }),
    ).toBeEnabled();
    await buyerPage
      .getByRole("button", { name: "30円で買う", exact: true })
      .click();
    await expect(
      buyerPage.getByRole("heading", { name: "今ラウンドの取引完了" }),
    ).toBeVisible();
    await expect(
      sellerPage.getByRole("heading", { name: "今ラウンドの取引完了" }),
    ).toBeVisible();
    expect((await snapshot(buyers[0].context)).me.profit).toBe(24);
    expect((await snapshot(sellers[0].context)).me.profit).toBe(21);

    // Concurrent HTTP requests compete for one order in another independent market.
    expect(
      (
        await command(sellers[0].context, {
          type: "quote",
          good: "orange",
          price: 75,
        })
      ).status(),
    ).toBe(200);
    const quote = (await snapshot(buyers[0].context)).quotes.find(
      (q) => q.good === "orange",
    )!;
    const race = await Promise.all(
      buyers
        .slice(0, 2)
        .map((b) => command(b.context, { type: "accept", quoteId: quote.id })),
    );
    expect(race.map((r) => r.status()).sort()).toEqual([200, 409]);
    expect(
      (await snapshot(teacher)).trades.filter((t) => t.good === "orange"),
    ).toHaveLength(1);
    for (let i = 1; i <= 3; i++) {
      expect(
        (
          await command(buyers[i].context, {
            type: "quote",
            good: "apple",
            price: 27 - i,
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await command(sellers[i].context, {
            type: "quote",
            good: "apple",
            price: 32 + i,
          })
        ).status(),
      ).toBe(200);
    }
    await expect(buyerPage.locator(".book-row")).toHaveCount(6);
    await buyerPage.screenshot({
      path: info.outputPath("student-desktop.png"),
      fullPage: true,
    });
    await teacherPage.screenshot({
      path: info.outputPath("teacher-desktop.png"),
      fullPage: true,
    });

    const publicView = await snapshot(buyers[0].context);
    expect(publicView).not.toHaveProperty("teacher");
    expect(JSON.stringify(publicView)).not.toMatch(
      /tokenHash|pinHash|equilibria|schedules/,
    );
    expect(
      (await buyers[0].context.request.get(`${apiPath}/export`)).status(),
    ).toBe(403);
    expect((await command(buyers[0].context, { type: "pause" })).status()).toBe(
      403,
    );
    const csrf = await teacher.request.post(`${apiPath}/commands`, {
      headers: { Origin: "https://untrusted.example" },
      data: {
        requestId: randomUUID(),
        expectedRound: 1,
        command: { type: "pause" },
      },
    });
    expect(csrf.status()).toBe(403);
    const impersonation = await buyers[0].context.request.post(
      `${apiPath}/commands`,
      {
        data: {
          requestId: randomUUID(),
          expectedRound: 1,
          command: { type: "quote", good: "banana", price: 60, role: "seller" },
        },
      },
    );
    expect(impersonation.status()).toBe(400);

    await teacherPage
      .getByRole("button", { name: "一時停止", exact: true })
      .click();
    await buyerPage.getByRole("button", { name: /バナナ/ }).click();
    await expect(
      buyerPage.getByRole("spinbutton", { name: "買いたい価格" }),
    ).toBeDisabled();
    await teacherPage
      .getByRole("button", { name: "再開する", exact: true })
      .click();
    await expect(
      buyerPage.getByRole("spinbutton", { name: "買いたい価格" }),
    ).toBeEnabled();

    // Simulated transport failure must disable actions and recover with a fresh snapshot.
    await buyers[0].context.setOffline(true);
    await expect(
      buyerPage.getByRole("spinbutton", { name: "買いたい価格" }),
    ).toBeDisabled();
    await buyers[0].context.setOffline(false);
    await expect(
      buyerPage.getByRole("spinbutton", { name: "買いたい価格" }),
    ).toBeEnabled();

    await teacherPage
      .getByRole("button", { name: "ラウンド終了", exact: true })
      .click();
    await teacherPage
      .getByRole("dialog")
      .getByRole("button", { name: "終了する", exact: true })
      .click();
    await teacherPage
      .getByRole("button", { name: "ラウンド2を開始", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(buyers[0].context)).round)
      .toBe(2);
    const nextRound = await snapshot(buyers[0].context);
    expect(nextRound.me.used).toEqual([]);
    expect(nextRound.me.profit).toBeGreaterThanOrEqual(24);
    expect(nextRound.me.limits).toEqual(buyers[0].view.me.limits);
    await expect(buyerPage.locator(".round-display strong b")).toHaveText("2");
    await buyerPage.getByRole("button", { name: /りんご/ }).click();
    for (const width of [768, 390, 320]) {
      await buyerPage.setViewportSize({ width, height: 844 });
      expect(
        await buyerPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await buyerPage.setViewportSize({ width: 390, height: 844 });
    await buyerPage.screenshot({
      path: info.outputPath("student-mobile.png"),
      fullPage: true,
    });
    await teacherPage.setViewportSize({ width: 390, height: 844 });
    expect(
      await teacherPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await teacherPage.screenshot({
      path: info.outputPath("teacher-mobile.png"),
      fullPage: true,
    });
    await teacherPage.setViewportSize({ width: 1440, height: 1080 });

    const reentry = await browser.newContext({ baseURL });
    contexts.push(reentry);
    const reentryPage = await reentry.newPage();
    await reentryPage.goto(`/?code=${code}`);
    await reentryPage
      .locator('input[name="nickname"]')
      .fill(buyers[0].view.me.nickname);
    await reentryPage.locator('input[name="pin"]').fill("2468");
    await reentryPage
      .getByRole("button", { name: "入室する", exact: true })
      .click();
    await expect(
      reentryPage.getByRole("heading", { name: "取引ルーム", exact: true }),
    ).toBeVisible();
    expect((await snapshot(reentry)).me.id).toBe(buyers[0].view.me.id);
    expect((await buyers[0].context.request.get(apiPath)).status()).toBe(401);

    // Recover directly on the room URL, without relying on route navigation.
    await expect(
      buyerPage.getByRole("heading", { name: "実験に参加する" }),
    ).toBeVisible();
    await buyerPage
      .locator('input[name="nickname"]')
      .fill(buyers[0].view.me.nickname);
    await buyerPage.locator('input[name="pin"]').fill("2468");
    await buyerPage
      .getByRole("button", { name: "入室する", exact: true })
      .click();
    await expect(
      buyerPage.getByRole("heading", { name: "取引ルーム", exact: true }),
    ).toBeVisible();
    expect((await snapshot(buyers[0].context)).me.id).toBe(
      buyers[0].view.me.id,
    );

    await teacherPage
      .getByRole("button", { name: "実験を終了", exact: true })
      .click();
    await teacherPage
      .getByRole("dialog")
      .getByRole("button", { name: "終了する", exact: true })
      .click();
    await expect(
      buyerPage.getByText("おつかれさまでした。実験は終了です"),
    ).toBeVisible();
    const [download] = await Promise.all([
      teacherPage.waitForEvent("download", { timeout: 15_000 }),
      teacherPage
        .getByRole("link", { name: /取引履歴.*CSV/ })
        .click({ timeout: 15_000 }),
    ]);
    expect(download.suggestedFilename()).toBe(`auction-${code}-trades.csv`);
    await download.saveAs(info.outputPath("trades.csv"));
    const exported = await teacher.request.get(
      `${apiPath}/export?kind=settings`,
    );
    const settings = await exported.json();
    expect(settings.participants).toHaveLength(12);
    expect(JSON.stringify(settings)).not.toMatch(
      /tokenHash|PasswordHash|pinHash/,
    );
    const events = await teacher.request.get(`${apiPath}/export?kind=events`);
    expect(await events.text()).toContain("round-started");
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});
