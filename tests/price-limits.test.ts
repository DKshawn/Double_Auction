import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { commandSchema, createRoomSchema } from "../src/lib/server/http";
import {
  DEFAULT_STAIRCASE_PARAMETERS,
  generateStaircase,
} from "../src/lib/study-generator";
import type { Command, RoomConfig } from "../src/lib/types";

const request = (command: Command) => ({
  requestId: randomUUID(),
  expectedRound: 1,
  command,
});

test("CDA, Call, Posted and legacy HTTP quotes accept five-digit prices and reject values outside 1–99999", () => {
  const commands = (price: number): Command[] => [
    { type: "study-quote", price },
    { type: "call-submit", prices: [price, price] },
    { type: "posted-offer", price, quantity: 2 },
    { type: "quote", good: "apple", price },
  ];
  for (const price of [1, 1000, 50000, 99999])
    for (const command of commands(price))
      assert.ok(commandSchema.safeParse(request(command)).success);
  for (const price of [0, -1, 100000, 99999.5, NaN, Infinity])
    for (const command of commands(price))
      assert.equal(commandSchema.safeParse(request(command)).success, false);
});

test("teacher HTTP settings share the expanded range for both private values and costs", () => {
  for (const amount of [1, 1000, 99999, 100000, 0, 1.5]) {
    const valid = [1, 1000, 99999].includes(amount);
    assert.equal(
      commandSchema.safeParse(
        request({
          type: "study-settings",
          expectedRevision: 0,
          settings: { values: [[amount, amount]], costs: [[amount, amount]] },
        }),
      ).success,
      valid,
    );
    const points = {
      values: Array(6).fill(amount),
      costs: Array(6).fill(amount),
    };
    assert.equal(
      commandSchema.safeParse(
        request({
          type: "update-markets",
          expectedRevision: 0,
          settings: { apple: points, banana: points, orange: points },
        }),
      ).success,
      valid,
    );
  }
});

test("creation and the staircase generator preserve the exact 99999 boundary without rounding or clipping", () => {
  const generator = {
    kind: "overlap-staircase" as const,
    parameters: { ...DEFAULT_STAIRCASE_PARAMETERS, p: 99967 },
    seed: 123456,
  };
  const generated = generateStaircase(generator.parameters);
  assert.equal(generated.demand[0], 99999);
  assert.equal(generated.supply[0], 99935);
  assert.deepEqual(generated.equilibrium, {
    low: 99967,
    high: 99967,
    quantity: 8,
    quantityMax: 12,
    surplus: 288,
  });
  const config: RoomConfig = {
    title: "価格上限テスト",
    protocol: "institutions-v1",
    markets: 1,
    marketSize: 16,
    capacity: 16,
    rounds: 15,
    duration: 180,
  };
  const input = { config, generator, password: "local-price-test" };
  assert.ok(createRoomSchema.safeParse(input).success);
  const tooHigh = { ...generator.parameters, p: 99968 };
  assert.throws(
    () => generateStaircase(tooHigh),
    /D\(1\)＝100000円.*上限99999円/s,
  );
  assert.equal(
    createRoomSchema.safeParse({
      ...input,
      generator: { ...generator, parameters: tooHigh },
    }).success,
    false,
  );
});
