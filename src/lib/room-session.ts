export type RoomSession = "teacher" | "student";

// This selects a credential slot; the server still authenticates its token.
export function roomApiHref(code: string, session: RoomSession, suffix = "") {
  return `/api/rooms/${code}${suffix}?session=${session}`;
}
