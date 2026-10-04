import {
  createHistogram,
  monitorEventLoopDelay,
  performance,
} from "node:perf_hooks";

// Opt-in local diagnostics only; no identifiers, prices, SQL, or credentials.
export function profilingEnabled() {
  if (
    process.env.LOCAL_PROFILE !== "1" ||
    process.env.LOCAL_ONLY !== "1" ||
    process.env.VERCEL
  )
    return false;
  try {
    const url = new URL(process.env.LOCAL_DATABASE_URL ?? "");
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
type Profile = {
  timings: Map<string, ReturnType<typeof createHistogram>>;
  loop: ReturnType<typeof monitorEventLoopDelay>;
};
const globals = globalThis as typeof globalThis & { auctionProfile?: Profile };
function state() {
  if (!globals.auctionProfile) {
    const loop = monitorEventLoopDelay({ resolution: 20 });
    loop.enable();
    globals.auctionProfile = { timings: new Map(), loop };
  }
  return globals.auctionProfile;
}
function record(name: string, start: number) {
  const s = state();
  let histogram = s.timings.get(name);
  if (!histogram) s.timings.set(name, (histogram = createHistogram()));
  histogram.record(Math.max(1, Math.round((performance.now() - start) * 1e6)));
}
export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!profilingEnabled()) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    record(name, start);
  }
}
export function timedSync<T>(name: string, fn: () => T): T {
  if (!profilingEnabled()) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    record(name, start);
  }
}
export function localProfile(reset = false) {
  const s = state();
  const summarize = (
    h: ReturnType<typeof createHistogram> | Profile["loop"],
  ) => ({
    count: h.count,
    mean: Math.round(h.mean / 1e3) / 1e3,
    p50: h.percentile(50) / 1e6,
    p95: h.percentile(95) / 1e6,
    p99: h.percentile(99) / 1e6,
    max: h.max / 1e6,
  });
  const result = {
    pid: process.pid,
    timingsMs: Object.fromEntries(
      [...s.timings].map(([key, h]) => [key, summarize(h)]),
    ),
    eventLoopDelayMs: summarize(s.loop),
  };
  if (reset) {
    s.timings.clear();
    s.loop.reset();
  }
  return result;
}
