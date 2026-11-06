import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Remote checks require an exact, explicitly authorized origin and a key file. */
export function verificationTarget(variable: string) {
  const origin = (process.env[variable] || "http://127.0.0.1:3200").replace(
    /\/$/,
    "",
  );
  const url = new URL(origin);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  assert.equal(
    url.origin,
    origin,
    "Verification origin must not contain a path",
  );
  if (!local) {
    assert.equal(url.protocol, "https:");
    assert.equal(
      process.env.VERIFY_REMOTE_ORIGIN,
      origin,
      "Explicit remote verification origin required",
    );
    assert.ok(
      process.env.VERIFY_TEACHER_KEY_FILE,
      "Teacher key file required for remote verification",
    );
  }
  const accessKey = process.env.VERIFY_TEACHER_KEY_FILE
    ? readFileSync(process.env.VERIFY_TEACHER_KEY_FILE, "utf8")
        .replace(/^\uFEFF/, "")
        .trim()
    : local && variable === "E2E_BASE_URL" && !process.env.E2E_BASE_URL
      ? (process.env.E2E_LOCAL_TEACHER_KEY ?? "")
      : "";
  if (!local) assert.ok(accessKey, "Teacher key is empty");
  return { origin, accessKey };
}
