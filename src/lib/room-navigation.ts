import type { RoomView } from "./types";

const validCode = (code?: string) => code && /^[A-Z2-9]{6}$/.test(code);

export const teacherSetupHref = (code?: string) =>
  validCode(code) ? `/teacher?room=${code}` : "/teacher";

export const teacherReentryHref = (code: string) =>
  validCode(code) ? `/teacher?code=${code}` : "/teacher";

// `entry` selects a session and its recovery route; it is never a credential.
export const teacherRoomHref = (code: string) => `/room/${code}?entry=teacher`;

export function roomNavigation(
  code: string,
  role?: RoomView["me"]["role"],
  entry?: string,
) {
  const teacher = role ? role === "teacher" : entry === "teacher";
  return {
    teacher,
    homeHref: teacher ? teacherSetupHref(code) : "/",
    recoveryHref: teacher ? teacherReentryHref(code) : "/",
  };
}
