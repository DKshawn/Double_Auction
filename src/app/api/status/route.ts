import { json } from "@/lib/server/http";

export function GET() {
  return json({
    mode: process.env.DATABASE_URL ? "online" : "local",
    ready:
      !process.env.VERCEL ||
      Boolean(process.env.DATABASE_URL && process.env.TEACHER_ACCESS_KEY),
    keyRequired: Boolean(process.env.VERCEL || process.env.TEACHER_ACCESS_KEY),
  });
}
