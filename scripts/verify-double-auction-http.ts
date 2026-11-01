import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type {
  Command,
  CommandRequest,
  RoomView,
} from "../src/experiments/double-auction/lib/types";
import { verificationTarget } from "./verification-target";

const { origin, accessKey } = verificationTarget("AUCTION_TEST_ORIGIN");
type Client = { cookie: string; role: "teacher" | "student" };
async function request<T>(
  path: string,
  client: Client,
  data?: unknown,
  expected = 200,
): Promise<T> {
  const response = await fetch(origin + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Cookie: client.cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  assert.equal(
    response.status,
    expected,
    `${path}: ${response.status} ${response.ok ? "" : await response.clone().text()}`,
  );
  const cookie = response.headers.get("set-cookie");
  if (cookie) client.cookie = cookie.split(";")[0];
  return (await response.json()) as T;
}
async function main() {
  const teacher: Client = { cookie: "", role: "teacher" };
  const password = "Platform-HTTP-Verification-2026";
  const { code } = await request<{ code: string }>("/api/rooms", teacher, {
    accessKey,
    password,
    config: {
      protocol: "institutions-v1",
      title: "DoubleAuction 公開前検証",
      markets: 1,
      marketSize: 2,
      capacity: 2,
      rounds: 1,
      duration: 180,
      studyInstitutions: ["cda"],
      studyPeriods: { cda: 1 },
    },
  });
  const path = `/api/rooms/${code}`;
  const view = (client: Client) =>
    request<RoomView>(path + `?session=${client.role}`, client);
  async function payload(
    client: Client,
    command: Command,
  ): Promise<CommandRequest> {
    const current = await view(client);
    return {
      requestId: randomUUID(),
      expectedRound: current.round,
      expectedStage: current.study!.market.stageKey,
      command,
    };
  }
  const send = async (client: Client, command: Command) =>
    request<RoomView>(
      path + `/commands?session=${client.role}`,
      client,
      await payload(client, command),
    );
  const participants: { client: Client; state: RoomView; nickname: string }[] =
    [];
  for (let i = 0; i < 2; i++) {
    const client: Client = { cookie: "", role: "student" },
      nickname = `公開検証${i + 1}`;
    await request(path + "/join", client, { nickname, pin: "2468" });
    participants.push({ client, state: await view(client), nickname });
  }
  await send(teacher, {
    type: "study-randomize",
    expectedRevision: (await view(teacher)).study!.lobby!.revision,
  });
  for (const participant of participants)
    participant.state = await view(participant.client);
  const buyer = participants.find((p) => p.state.me.role === "buyer")!;
  const seller = participants.find((p) => p.state.me.role === "seller")!;
  assert.ok(buyer && seller);
  const starting = await send(teacher, { type: "start" });
  assert.equal(starting.study!.market.stage, "countdown");
  await new Promise((resolve) => setTimeout(resolve, 5200));
  await send(seller.client, { type: "study-quote", price: 80 });
  const offer = (await view(buyer.client)).study!.market.orders.find(
    (o) => o.participantId === seller.state.me.id,
  )!;
  assert.ok(offer);
  const accept = await payload(buyer.client, {
    type: "study-accept",
    orderId: offer.id,
  });
  for (let i = 0; i < 2; i++)
    await request(path + "/commands?session=student", buyer.client, accept);
  assert.equal((await view(teacher)).study!.market.trades.length, 1);
  const recovered: Client = { cookie: "", role: "student" };
  await request(path + "/join", recovered, {
    nickname: buyer.nickname,
    pin: "2468",
  });
  assert.equal((await view(recovered)).study!.myTrades.length, 1);
  await send(teacher, { type: "finish" });
  assert.equal((await view(teacher)).phase, "finished");
  for (const kind of ["trades", "settings"]) {
    const exported = await fetch(
      origin + path + `/export?kind=${kind}&session=teacher`,
      { headers: { Cookie: teacher.cookie } },
    );
    assert.equal(exported.status, 200);
    assert.match(
      exported.headers.get("content-disposition") ?? "",
      /attachment/,
    );
    assert.ok((await exported.text()).length > 20);
  }
  const renewed: Client = { cookie: "", role: "teacher" };
  await request(path + "/teacher", renewed, { password });
  assert.equal((await view(renewed)).study!.market.trades.length, 1);
  console.log(
    JSON.stringify({
      code,
      trades: 1,
      verified: [
        "teacher create",
        "student join and allocation",
        "CDA quote and trade",
        "idempotent retry",
        "student refresh/reentry",
        "finish",
        "CSV/settings export",
        "teacher reentry",
      ],
    }),
  );
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
