import type { Phase } from "./types";
import type { Institution } from "./study-types";

export type RoomSummary = {
  code: string;
  title: string;
  createdAt: number;
  phase: Phase;
  round: number;
  totalRounds: number;
  participantCount: number;
  capacity: number;
  flexibleAdmission?: boolean;
  marketCount: number;
  institutions: { institution: Institution; periods: number }[];
};
