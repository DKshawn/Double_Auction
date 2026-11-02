import { addParticipant, newRoom } from "./engine";
import { allocationPlan } from "./allocation";
import { EXP2_SETTINGS, settingsSchema, type EmhSettings } from "./settings";
import type { Participant, Room } from "./types";

export function makeDemo(
  title: string,
  input: EmhSettings,
  now: number,
  experiment: "exp1" | "exp2" = "exp1",
) {
  const settings =
    experiment === "exp2"
      ? structuredClone(EXP2_SETTINGS)
      : settingsSchema.parse(input);
  const allocation = allocationPlan(settings.targetMarketSize, settings)[0];
  const room = newRoom(
    "DEMO23",
    {
      title,
      initialUnits: settings.initialUnits,
      rounds: 6,
      periodSeconds: settings.periodSeconds,
      unitSeconds: 30,
      breakSeconds: 60,
      ...(experiment === "exp2"
        ? {
            experiment: "exp2" as const,
            states: {
              prior: [0.35, 0.42, 0.23],
              outcomes: [3, 3, 3, 3, 2, 2],
              dividends: [
                [80, 110, 170],
                [60, 180, 100],
                [140, 120, 90],
              ],
            },
          }
        : {}),
      // Practice dividends stay separate from the private classroom protocol.
      dividends:
        experiment === "exp2"
          ? []
          : [
              { a: 120, b: 40 },
              { a: 100, b: 60 },
              { a: 150, b: 30 },
            ],
    },
    now,
  );
  room.typeCounts = allocation.typeCounts;
  for (let i = 0; i < allocation.size; i++)
    addParticipant(
      room,
      {
        id: `demo-${i}`,
        name: i === 0 ? "あなた" : `参加者 ${i + 1}`,
        studentId: `demo${i + 1}`,
        pinHash: "",
        tokenHash: "",
      },
      now,
    );
  return room;
}

/** Virtual traders only use their own information, just like a participant. */
export function demoTraderValue(room: Room, participant: Participant) {
  if (room.config.experiment === "exp2") {
    const states = room.config.states!;
    const values = states.dividends[participant.type! - 1]!;
    if (participant.insider && room.year > 2)
      return values[states.outcomes[room.year - 1]! - 1]!;
    return values.reduce((sum, value, i) => sum + value * states.prior[i]!, 0);
  }
  const dividend = room.config.dividends[participant.type! - 1]!;
  return room.period === "A" ? dividend.a + dividend.b : dividend.b;
}
