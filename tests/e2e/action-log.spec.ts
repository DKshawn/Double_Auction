import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { Command, CommandRequest, RoomView } from "../../src/lib/types";

async function classroom(teacher: Page, browser: Browser, baseURL: string) {
  expect(new URL(baseURL).hostname).toBe("127.0.0.1");
  const created = await teacher.request.post("/api/rooms", {
    data: {
      config: {
        title: "操作監査 E2E",
        protocol: "institutions-v1",
        markets: 1,
        marketSize: 2,
        capacity: 2,
        rounds: 2,
        duration: 180,
        studyInstitutions: ["cda"],
        studyPeriods: { cda: 2 },
        studyCommission: 0,
      },
      password: "Audit-browser-test-only",
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { code } = await created.json();
  const api = `/api/rooms/${code}`;
  const contexts: BrowserContext[] = [];
  const snapshot = async (context: BrowserContext): Promise<RoomView> => {
    const response = await context.request.get(api);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const send = async (command: Command) => {
    const view = await snapshot(teacher.context());
    const response = await teacher.request.post(
      `${api}/commands?session=teacher`,
      { data: { requestId: randomUUID(), expectedRound: view.round, command } },
    );
    expect(response.ok(), await response.text()).toBe(true);
  };
  const admission = (await snapshot(teacher.context())).study!.lobby!;
  if (admission.admission) await send({ type: "study-admission", action: "open", expectedRevision: admission.revision });
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ baseURL });
    contexts.push(context);
    const response = await context.request.post(`${api}/join`, {
      data: { nickname: `操作監査${i}`, pin: "1234" },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const lobby = (await snapshot(teacher.context())).study!.lobby!;
  if (lobby.admission) await send({ type: "study-admission", action: "close", markets: 1, marketMode: "manual", expectedRevision: lobby.revision });
  else await send({ type: "study-randomize", expectedRevision: lobby.revision });
  const students = await Promise.all(
    contexts.map(async (context) => ({
      context,
      view: await snapshot(context),
      page: await context.newPage(),
    })),
  );
  await send({ type: "start" });
  const buyer = students.find((student) => student.view.me.role === "buyer")!;
  const seller = students.find((student) => student.view.me.role === "seller")!;
  await Promise.all(
    students.map(async (student) => {
      await student.page.goto(`/room/${code}`);
      await expect(
        student.page.locator('[data-audit-button="quote.submit"]'),
      ).toBeEnabled();
    }),
  );
  return {
    buyer,
    seller,
    api,
    code,
    snapshot,
    close: async () => {
      for (const context of contexts) await context.close();
    },
  };
}

test("all button activations, validation, distinct commands and rejections are audited without awaiting telemetry", async ({
  page: teacher,
  browser,
  baseURL,
}) => {
  const room = await classroom(teacher, browser, baseURL!);
  const errors: string[] = [];
  room.seller.page.on("pageerror", (error) => errors.push(error.message));
  room.buyer.page.on("pageerror", (error) => errors.push(error.message));
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>();
  const sellerRequests: CommandRequest[] = [],
    buyerRequests: CommandRequest[] = [];
  room.seller.page.on("request", (request) => {
    if (request.url().includes("/commands") && request.method() === "POST")
      sellerRequests.push(request.postDataJSON());
  });
  room.buyer.page.on("request", (request) => {
    if (request.url().includes("/commands") && request.method() === "POST")
      buyerRequests.push(request.postDataJSON());
  });
  await room.seller.page.route(`**${room.api}/actions?*`, async (route) => {
    if (route.request().method() === "POST") {
      started.resolve();
      await gate.promise;
    }
    await route.continue();
  });
  try {
    await room.seller.page
      .locator('[data-audit-button="quote.submit"]')
      .click();
    await expect(room.seller.page.locator('.study-order-form [role="alert"]')).toContainText(
      "整数で入力",
    );
    expect(sellerRequests).toHaveLength(0);
    await room.seller.page
      .locator('[data-audit-button="order-book.chart"]')
      .click();
    await started.promise;
    await room.seller.page.locator(".study-price-input input").fill("80");
    await room.seller.page.locator(".study-price-input input").press("Enter");
    await expect
      .poll(
        async () =>
          (await room.snapshot(room.seller.context)).study!.market.orders
            .length,
      )
      .toBe(1);
    // The click log upload is still blocked here, but the order has committed.
    expect(sellerRequests).toHaveLength(1);
    expect(sellerRequests[0].command.type).toBe("study-quote");
    expect(sellerRequests[0].interaction?.button).toBe("quote.submit");
    gate.resolve();
    await expect(
      room.buyer.page.locator('[data-audit-button="quote.accept-best"]'),
    ).toBeEnabled();
    await room.buyer.page
      .locator('[data-audit-button="quote.accept-best"]')
      .click();
    await expect
      .poll(
        async () =>
          (await room.snapshot(room.buyer.context)).study!.myTrades.length,
      )
      .toBe(1);
    expect(buyerRequests[0].command.type).toBe("study-accept");
    expect(buyerRequests[0].interaction?.button).toBe("quote.accept-best");
    await room.seller.page.locator(".study-price-input input").fill("90");
    await room.seller.page
      .locator('[data-audit-button="quote.submit"]')
      .click();
    await expect(
      room.buyer.page.locator('[data-audit-button="quote.accept-best"]'),
    ).toBeEnabled();
    await room.buyer.page.route(`**${room.api}/commands?*`, async (route) => {
      const body = route.request().postDataJSON() as CommandRequest;
      if (body.command.type === "study-accept")
        body.command.orderId = randomUUID();
      await route.continue({ postData: JSON.stringify(body) });
    });
    await room.buyer.page
      .locator('[data-audit-button="quote.accept-best"]')
      .click();
    await expect(
      room.buyer.page.getByText("最良注文が変更または約定済みです。", {
        exact: true,
      }),
    ).toBeVisible();
    await room.buyer.page.unroute(`**${room.api}/commands?*`);
    await room.buyer.page.locator(".study-price-input input").fill("100");
    await room.buyer.page.locator('[data-audit-button="quote.submit"]').click();
    await expect
      .poll(
        async () =>
          (await room.snapshot(room.buyer.context)).study!.myTrades.length,
      )
      .toBe(2);
    await expect
      .poll(
        async () => {
          const response = await teacher.request.get(
            `${room.api}/export?kind=actions&session=teacher`,
          );
          return response.ok() ? response.text() : "";
        },
        { timeout: 25_000 },
      )
      .toContain("INVALID_PRICE");
    const csv = await (
      await teacher.request.get(
        `${room.api}/export?kind=actions&session=teacher`,
      )
    ).text();
    expect(csv).toContain("BEST_ORDER_CHANGED");
    expect(csv).toContain("order-book.chart");
    expect(csv).toContain("study-accept");
    expect(csv).toContain("study-quote");
    expect(
      csv
        .split("\r\n")
        .filter((line) => line.includes(sellerRequests[0].interaction!.id)),
    ).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    gate.resolve();
    await room.close();
  }
});

test("unuploaded activations persist through reload and repeated uploads do not duplicate CSV rows", async ({
  page: teacher,
  browser,
  baseURL,
}) => {
  const room = await classroom(teacher, browser, baseURL!);
  try {
    await room.seller.page.route(`**${room.api}/actions?*`, (route) =>
      route.abort(),
    );
    await room.seller.page
      .locator('[data-audit-button="quote.submit"]')
      .click();
    const pending = async () =>
      room.seller.page.evaluate(
        () =>
          new Promise<{ interaction: { id: string }; phase: string }[]>(
            (resolve, reject) => {
              const request = indexedDB.open("auction-action-log-v1", 1);
              request.onsuccess = () => {
                const read = request.result
                  .transaction("pending")
                  .objectStore("pending")
                  .getAll();
                read.onsuccess = () => {
                  request.result.close();
                  resolve(
                    read.result.map(
                      (item: {
                        event: { interaction: { id: string }; phase: string };
                      }) => item.event,
                    ),
                  );
                };
                read.onerror = () => reject(read.error);
              };
              request.onerror = () => reject(request.error);
            },
          ),
      );
    await expect
      .poll(async () => (await pending()).length)
      .toBeGreaterThanOrEqual(2);
    const id = (await pending())[0].interaction.id;
    await room.seller.page.reload();
    await expect(
      room.seller.page.locator('[data-audit-button="quote.submit"]'),
    ).toBeEnabled();
    await room.seller.page.unroute(`**${room.api}/actions?*`);
    await expect
      .poll(
        async () => {
          const response = await teacher.request.get(
            `${room.api}/export?kind=actions&session=teacher`,
          );
          return response.ok() ? response.text() : "";
        },
        { timeout: 25_000 },
      )
      .toContain(id);
    const csv = await (
      await teacher.request.get(
        `${room.api}/export?kind=actions&session=teacher`,
      )
    ).text();
    expect(csv.split("\r\n").filter((line) => line.includes(id))).toHaveLength(
      1,
    );
    await expect
      .poll(async () => (await pending()).length, { timeout: 25_000 })
      .toBe(0);
  } finally {
    await room.close();
  }
});
