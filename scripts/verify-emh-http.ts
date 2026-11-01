import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type {
  RequestCommand,
  SessionView,
} from "../src/experiments/emh/session-types";

import { verificationTarget } from "./verification-target";
const { origin, accessKey } = verificationTarget("EMH_TEST_ORIGIN");
const password = "HTTP-Verification-2026";
async function call(
  path: string,
  body?: unknown,
  cookie = "",
  expected = 200,
  method?: string,
) {
  const response = await fetch(`${origin}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return {
    result,
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}

async function main() {
  const created = await call("/api/emh/rooms", {
    title: "EMH HTTP 検証",
    password,
    accessKey,
  });
  const code = created.result.code as string;
  const teacher = created.cookie;
  assert.ok(teacher.startsWith(`auction_${code}_teacher=`));
  const path = `/api/rooms/${code}`;
  const get = async (
    cookie = teacher,
    role = "teacher",
    market?: number,
  ): Promise<SessionView> =>
    (
      await call(
        `${path}/emh?session=${role}${market ? `&market=${market}` : ""}`,
        undefined,
        cookie,
      )
    ).result.state;
  async function session(
    kind: "assign" | "start" | "pause-all" | "resume-all" | "reveal-all",
  ) {
    const state = await get();
    const input: RequestCommand = {
      requestId: randomUUID(),
      scope: "session",
      command: { kind, expectedRevision: state.revision },
    };
    return (await call(`${path}/emh?session=teacher`, input, teacher)).result
      .state as SessionView;
  }
  const students: string[] = [];
  for (let i = 0; i < 14; i++)
    students.push(
      (await call(`${path}/join`, { nickname: `HTTP${i}`, pin: "1234" }))
        .cookie,
    );
  await call(`${path}/emh?session=teacher`, undefined, students[0], 401);
  await call(`${path}/emh?session=student`, undefined, teacher, 401);
  await call(
    "/api/emh/rooms",
    { title: "invalid", password, rounds: 1 },
    "",
    400,
  );
  const assigned = await session("assign");
  assert.deepEqual(
    assigned.allocation.map((m) => m.size),
    [7, 7],
  );
  await session("start");
  const views = await Promise.all(
    students.map((cookie) => get(cookie, "student")),
  );
  const indices = views
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v.marketId === 1);
  const seller = indices[0],
    buyer = indices[1];
  await call(
    `${path}/emh?session=student&market=2`,
    undefined,
    students[seller.i],
    403,
  );
  const quoted = (
    await call(
      `${path}/emh?session=student&market=1`,
      {
        scope: "market",
        marketId: 1,
        requestId: randomUUID(),
        action: {
          kind: "quote",
          side: "ask",
          price: 300,
          unitKey: seller.v.market!.unitKey,
        },
      },
      students[seller.i],
    )
  ).result.state as SessionView;
  const trade: RequestCommand = {
    scope: "market",
    marketId: 1,
    requestId: randomUUID(),
    action: {
      kind: "accept",
      side: "ask",
      quoteId: quoted.market!.ask!.id,
      unitKey: quoted.market!.unitKey,
    },
  };
  await call(`${path}/emh?session=student&market=1`, trade, students[buyer.i]);
  await call(`${path}/emh?session=student&market=1`, trade, students[buyer.i]);
  assert.equal((await get(teacher, "teacher", 1)).market!.trades.length, 1);
  assert.equal((await get(teacher, "teacher", 2)).market!.trades.length, 0);
  assert.equal(
    (await get(students[seller.i], "student")).market!.me!.holdings,
    1,
  );
  assert.equal(
    (await get(students[buyer.i], "student")).market!.me!.holdings,
    3,
  );
  assert.ok((await session("pause-all")).markets.every((m) => m.paused));
  assert.ok((await session("resume-all")).markets.every((m) => !m.paused));
  for (let market = 1; market <= 2; market++)
    for (let i = 0; i < 20; i++) {
      const state = await get(teacher, "teacher", market);
      const current = state.market!;
      if (current.status === "completed") break;
      await call(
        `${path}/emh?session=teacher&market=${market}`,
        {
          requestId: randomUUID(),
          scope: "market",
          marketId: market,
          action: {
            kind: current.status === "break" ? "next-year" : "end-period",
            expectedPhase: current.phaseKey,
          },
        },
        teacher,
      );
    }
  assert.equal((await get()).status, "completed");
  assert.equal((await get(students[0], "student")).market!.conditions, null);
  await session("reveal-all");
  assert.equal(
    (await get(students[0], "student")).market!.conditions?.length,
    3,
  );
  const csv = await fetch(
    `${origin}${path}/emh/export?session=teacher&kind=results`,
    { headers: { Cookie: teacher } },
  );
  assert.equal(csv.status, 200);
  assert.ok(csv.headers.get("content-type")?.includes("text/csv"));
  assert.equal((await csv.text()).split("\r\n").length, 25);
  const personal = await fetch(
    `${origin}${path}/emh/export?session=student&kind=personal`,
    { headers: { Cookie: students[0] } },
  );
  assert.equal(personal.status, 200);
  const denied = await fetch(
    `${origin}${path}/emh/export?session=student&kind=conditions`,
    { headers: { Cookie: students[0] } },
  );
  assert.equal(denied.status, 403);
  const recovered = await call(`${path}/teacher`, { password });
  assert.equal((await get(recovered.cookie)).status, "completed");
  await call(`${path}/emh?session=teacher`, undefined, teacher, 401);
  const da = await call("/api/rooms", {
    password,
    accessKey,
    config: {
      protocol: "institutions-v1",
      title: "Double Auction HTTP 検証",
      markets: 1,
      marketSize: 2,
      capacity: 2,
      rounds: 1,
      duration: 180,
      studyInstitutions: ["cda"],
      studyPeriods: { cda: 1 },
    },
  });
  const daCode = da.result.code as string;
  const daStudent = await call(`/api/rooms/${daCode}/join`, {
    nickname: "DA検証",
    pin: "1234",
  });
  assert.equal(
    (
      await call(
        `/api/rooms/${daCode}?session=student`,
        undefined,
        daStudent.cookie,
      )
    ).result.code,
    daCode,
  );
  const rooms = (await call("/api/rooms/manage", { accessKey })).result.rooms;
  assert.ok(
    rooms.some(
      (r: { code: string; experiment?: string }) =>
        r.code === code && r.experiment === "emh",
    ),
  );
  assert.ok(rooms.some((r: { code: string }) => r.code === daCode));
  console.log(
    JSON.stringify({
      emh: code,
      doubleAuction: daCode,
      groups: [7, 7],
      roundResults: 24,
      tradeCount: 1,
      verified:
        "common login, role cookies, isolation, retry, all 6 rounds, reveal, CSV, room management",
    }),
  );
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
