import { digest, equal, passwordMatches } from "@/lib/server/auth";
import { AuctionError, type Room } from "../lib/auction-model";

export function verifyTeacherPassword(
  room: Room,
  now: number,
  password: string,
) {
  if (room.teacherLockedUntil > now)
    throw new AuctionError(
      "パスワードの試行回数が多いため、しばらく待ってください。",
      429,
    );
  if (!passwordMatches(password, room.teacherPasswordHash)) {
    room.teacherFailedLogins++;
    if (room.teacherFailedLogins >= 5) {
      room.teacherLockedUntil = now + 60_000;
      room.teacherFailedLogins = 0;
    }
    throw new AuctionError("教員パスワードが正しくありません。", 403);
  }
  room.teacherFailedLogins = 0;
  room.teacherLockedUntil = 0;
}
export function authenticate(room: Room, token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new AuctionError(
      "入室が必要です。ルームコードで入室してください。",
      401,
    );
  const hash = digest(token);
  if (equal(hash, room.teacherTokenHash)) return "teacher" as const;
  const participant = room.participants.find((p) => equal(p.tokenHash, hash));
  if (!participant)
    throw new AuctionError(
      "入室情報の有効期限が切れました。再入室してください。",
      401,
    );
  return participant;
}
