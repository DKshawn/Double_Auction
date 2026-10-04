import { localProfile, profilingEnabled } from "@/lib/server/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function permitted(request: Request) {
  return (
    profilingEnabled() &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname)
  );
}
export async function GET(request: Request) {
  return permitted(request)
    ? Response.json(localProfile(), {
        headers: { "Cache-Control": "no-store" },
      })
    : new Response(null, { status: 404 });
}
export async function POST(request: Request) {
  return permitted(request)
    ? Response.json(localProfile(true), {
        headers: { "Cache-Control": "no-store" },
      })
    : new Response(null, { status: 404 });
}
