import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { localDatabase, migrate } from "../src/lib/server/database";
import { AuctionService } from "../src/lib/server/service";
import { RealtimeBroker } from "../src/lib/server/realtime";
import { applyPatch, type RoomPatch } from "../src/lib/room-sync";
import type { RoomView } from "../src/lib/types";

test("default local PGlite pushes authorized changes and revokes an old teacher session", async () => {
  const pg = new PGlite(),
    db = localDatabase(pg),
    broker = new RealtimeBroker(db);
  let stop: (() => void) | undefined;
  try {
    await migrate(db);
    const svc = new AuctionService(db);
    const teacher = await svc.create(
      {
        title: "PGlite通知",
        protocol: "institutions-v1",
        markets: 1,
        capacity: 16,
        rounds: 15,
        duration: 180,
      },
      "Local-Test-2026",
      "",
    );
    let view: RoomView | undefined,
      rejected = false;
    stop = await broker.subscribe(teacher.code, teacher.token, (event) => {
      if (event.type === "snapshot") view = event.data as RoomView;
      else if (event.type === "patch")
        view = applyPatch(view!, event.data as RoomPatch);
      else if (event.type === "session-error")
        rejected = (event.data as { status: number }).status === 401;
    });
    assert.equal(view!.participantCount, 0);
    await svc.join(teacher.code, "通知の確認", "123456");
    async function until(fn: () => boolean) {
      const end = Date.now() + 3000;
      while (!fn()) {
        assert.ok(Date.now() < end, "notification timed out");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    await until(() => view!.participantCount === 1);
    assert.equal(view!.study!.teacher!.participants.length, 1);
    await svc.recoverTeacher(teacher.code, "Local-Test-2026");
    await until(() => rejected);
  } finally {
    stop?.();
    await broker.close();
    await pg.close();
  }
});
