import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { AuctionError, type Room } from "./model";

export const newToken = () => randomBytes(32).toString("hex");
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
export function passwordMatches(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  return (
    Boolean(salt && key) &&
    equal(scryptSync(password, salt, 32).toString("hex"), key)
  );
}
export function assertTeacherAccess(accessKey: string) {
  if (process.env.VERCEL && !process.env.TEACHER_ACCESS_KEY)
    throw new AuctionError("管理者による教員用キーの設定が必要です。", 503);
  if (
    process.env.TEACHER_ACCESS_KEY &&
    !equal(accessKey, process.env.TEACHER_ACCESS_KEY)
  )
    throw new AuctionError("教員用キーが正しくありません。", 403);
}

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
