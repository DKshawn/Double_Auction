import { expect, test } from "@playwright/test";
import { verificationTarget } from "../../scripts/verification-target";

test("one teacher login protects entry and authorizes all experiments and management without another key", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const { accessKey } = verificationTarget("E2E_BASE_URL");
  test.skip(!accessKey, "Requires a key-enabled verification server");
  const codes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const outsider = await browser.newContext({ baseURL });
  try {
    await page.goto("/teacher?experiment=emh");
    await expect(page).toHaveURL(/\/teacher\/login\?next=/);
    await expect(
      page.getByRole("heading", { name: "教員ログイン", exact: true }),
    ).toBeVisible();
    await expect(page.locator('[name="initialUnits"]')).toHaveCount(0);
    expect(
      (await page.request.post("/api/rooms/manage", { data: {} })).status(),
    ).toBe(401);
    for (const [endpoint, payload] of [
      ["/api/emh/rooms", { title: "Denied", password: "12345678" }],
      [
        "/api/rooms",
        {
          password: "12345678",
          config: { title: "Denied", capacity: 12, rounds: 1, duration: 180 },
        },
      ],
      [
        "/api/judgment/rooms",
        {
          title: "Denied",
          password: "12345678",
          settings: {
            studyIds: ["02-01"],
            randomizeExperiments: false,
            randomizeChoices: false,
          },
        },
      ],
    ] as const)
      expect(
        (await page.request.post(endpoint, { data: payload })).status(),
      ).toBe(401);
    await page
      .getByLabel("教員用キー", { exact: false })
      .fill("invalid-test-key");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(
      page.locator(".teacher-login").getByRole("alert"),
    ).toContainText("正しくありません");
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel("教員用キー", { exact: false }).fill(accessKey);
    const loginResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/teacher/session") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    expect((await loginResponse).ok()).toBe(true);
    await expect(page).toHaveURL(/\/teacher\?experiment=emh$/);
    const cookies = await page.context().cookies();
    const session = cookies.find(
      (cookie) => cookie.name === "lab_teacher_session",
    )!;
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe("Lax");
    expect(session.secure).toBe(new URL(baseURL!).protocol === "https:");
    expect(session.value).not.toContain(accessKey);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "lab_teacher_session",
    );
    expect(
      await page.evaluate(() => ({
        local: localStorage.getItem("accessKey"),
        session: sessionStorage.getItem("accessKey"),
      })),
    ).toEqual({ local: null, session: null });
    await page.reload();
    await expect(page).toHaveURL(/\/teacher\?experiment=emh$/);
    await page
      .locator(".emh-create")
      .screenshot({ path: info.outputPath("emh-create-after-login.png") });

    for (const experiment of ["emh", "institutions", "judgment"]) {
      await page.goto(`/teacher?experiment=${experiment}`);
      await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(
        0,
      );
      await page
        .getByLabel("実験名", { exact: true })
        .fill(`入口検証 ${experiment}`);
      await page
        .getByLabel("教員パスワード", { exact: false })
        .fill("Teacher-Entry-Verification");
      if (experiment === "judgment")
        await page
          .locator('.judgment-study-option input[type="checkbox"]')
          .first()
          .check();
      const responsePromise = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /\/api\/(?:emh\/|judgment\/)?rooms$/.test(new URL(r.url()).pathname),
      );
      await page
        .getByRole("button", {
          name: experiment === "institutions" ? "ルーム作成" : "ルームを作成",
          exact: true,
        })
        .click();
      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      expect(response.request().postDataJSON()).not.toHaveProperty("accessKey");
      await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}\?entry=teacher$/);
      const code = new URL(page.url()).pathname.split("/")[2];
      codes.push(code);
      await expect(page).toHaveURL(`/room/${code}?entry=teacher`);
      const unauthorized = await outsider.newPage();
      await unauthorized.goto(`/room/${code}?entry=teacher`);
      await expect(unauthorized).toHaveURL(/\/teacher\/login/);
      await unauthorized.close();
    }
    await page.goto("/teacher");
    await expect(page.locator(".teacher-room-list")).toBeVisible();
    await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "更新", exact: true }).click();
    const rooms = await (
      await page.request.post("/api/rooms/manage", { data: {} })
    ).json();
    for (const code of codes)
      expect(
        rooms.rooms.some((room: { code: string }) => room.code === code),
      ).toBe(true);
    const original = codes[0];
    await page.goto(`/teacher?code=${original}`);
    await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(
      0,
    );
    await page
      .getByLabel("教員パスワード", { exact: false })
      .fill("Teacher-Entry-Verification");
    await page
      .getByRole("button", { name: "管理画面に入る", exact: true })
      .click();
    await expect(page).toHaveURL(`/room/${original}?entry=teacher`);
    for (const code of codes)
      expect(
        (
          await page.request.delete(`/api/rooms/${code}`, {
            data: { confirmed: true },
          })
        ).ok(),
      ).toBe(true);
    codes.length = 0;
    await page.goto("/teacher");
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher\/login/);
    expect(
      (await page.request.post("/api/rooms/manage", { data: {} })).status(),
    ).toBe(401);
    await page.goto("/teacher?experiment=judgment");
    await expect(page).toHaveURL(/\/teacher\/login/);
    expect(errors).toEqual([]);
  } finally {
    // Clean up only this test's rooms, even if the UI check failed or logged out.
    for (const code of codes)
      expect
        .soft(
          (
            await page.request.delete(`/api/rooms/${code}`, {
              data: { confirmed: true, accessKey },
            })
          ).ok(),
        )
        .toBe(true);
    await outsider.close();
  }
});
