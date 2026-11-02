import { addParticipant, newRoom } from "./engine";
import { allocationPlan } from "./allocation";
import { settingsSchema, type EmhSettings } from "./settings";

export function makeDemo(title: string, input: EmhSettings, now: number) {
  const settings = settingsSchema.parse(input);
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
      // Practice dividends stay separate from the private classroom protocol.
      dividends: [
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
