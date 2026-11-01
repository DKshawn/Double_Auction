import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { AuctionError } from "./errors";

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
