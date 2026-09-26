import { json } from "@/lib/server/http";
import { getServerStatus } from "@/lib/server/config";

export function GET() {
  return json(getServerStatus());
}
