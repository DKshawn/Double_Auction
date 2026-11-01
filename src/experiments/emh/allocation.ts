import type { Allocation } from "./session-types";

export const MAX_PARTICIPANTS = 999;
export function allocationPlan(attendance: number): Allocation[] {
  if (
    !Number.isInteger(attendance) ||
    attendance < 0 ||
    attendance > MAX_PARTICIPANTS
  )
    throw new Error("参加者数を確認してください。");
  if (!attendance) return [];
  let count = Math.max(1, Math.round(attendance / 9));
  if (Math.ceil(attendance / count) > 12) count++;
  let nextType = 0;
  return Array.from({ length: count }, (_, index) => {
    const size =
      Math.floor(attendance / count) + (index < attendance % count ? 1 : 0);
    const typeCounts = Array<number>(3).fill(Math.floor(size / 3));
    for (let i = 0; i < size % 3; i++) typeCounts[(nextType + i) % 3]++;
    nextType = (nextType + (size % 3)) % 3;
    return { id: index + 1, size, typeCounts };
  });
}
