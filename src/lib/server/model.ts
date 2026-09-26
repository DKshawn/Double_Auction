import type { GoodId } from "../catalog";
import type { Phase, Quote, Role, RoomConfig, Trade } from "../types";

export type Participant = {
  id: string;
  alias: string;
  nickname: string;
  role: Role;
  seat: number;
  limits: Record<GoodId, number>;
  tokenHash: string;
  pinHash: string;
  failedLogins: number;
  lockedUntil: number;
};
export type AuditEvent = {
  sequence: number;
  at: number;
  round: number;
  type: string;
  actor: string;
  detail: Record<string, unknown>;
};
export type Room = {
  code: string;
  config: RoomConfig;
  phase: Phase;
  round: number;
  version: number;
  deadline: number | null;
  remainingMs: number;
  createdAt: number;
  teacherTokenHash: string;
  teacherPasswordHash: string;
  teacherFailedLogins: number;
  teacherLockedUntil: number;
  participants: Participant[];
  seats: number[];
  quotes: Quote[];
  trades: Trade[];
  sequence: number;
  receipts: { actor: string; requestId: string }[];
};

export class AuctionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AuctionError";
  }
}

export function emit(
  room: Room,
  events: AuditEvent[],
  at: number,
  type: string,
  actor: string,
  detail: Record<string, unknown> = {},
) {
  const event = {
    sequence: ++room.sequence,
    at,
    round: room.round,
    type,
    actor,
    detail,
  };
  events.push(event);
  return event.sequence;
}
