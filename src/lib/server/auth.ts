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
