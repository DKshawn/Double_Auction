import { test } from "node:test";
import assert from "node:assert/strict";
import { profilingEnabled, timed } from "../src/lib/server/performance";

test("timing diagnostics require an explicit local-only app and loopback database", async () => {
  const keys = ["LOCAL_PROFILE", "LOCAL_ONLY", "LOCAL_DATABASE_URL", "VERCEL"];
  const before = keys.map((key) => [key, process.env[key]] as const);
  try {
    process.env.LOCAL_PROFILE = "1";
    process.env.LOCAL_ONLY = "1";
    process.env.LOCAL_DATABASE_URL = "postgresql://test:local@127.0.0.1/test";
    delete process.env.VERCEL;
    assert.equal(profilingEnabled(), true);
    process.env.VERCEL = "1";
    assert.equal(profilingEnabled(), false);
    delete process.env.VERCEL;
    process.env.LOCAL_DATABASE_URL = "postgresql://test@example.com/test";
    assert.equal(profilingEnabled(), false);
    process.env.LOCAL_DATABASE_URL = "postgresql://test@localhost/test";
    process.env.LOCAL_ONLY = "0";
    assert.equal(profilingEnabled(), false);
    process.env.LOCAL_ONLY = "1";
    delete process.env.LOCAL_PROFILE;
    assert.equal(profilingEnabled(), false);
    assert.equal(await timed("disabled", async () => 42), 42);
    await assert.rejects(
      timed("disabled", async () => {
        throw new Error("original");
      }),
      /original/,
    );
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
