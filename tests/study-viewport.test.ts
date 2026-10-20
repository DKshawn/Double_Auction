import { test } from "node:test";
import assert from "node:assert/strict";
import { fitStudyViewport } from "../src/lib/study-viewport";

test("the reference MacBook layout remains at its original size and larger screens never enlarge text", () => {
  assert.deepEqual(fitStudyViewport(1512, 862), {
    width: 1512,
    height: 862,
    scale: 1,
  });
  assert.deepEqual(fitStudyViewport(1920, 1080), {
    width: 1920,
    height: 1080,
    scale: 1,
  });
});

test("every preview preset fits the entire workstation with one scale, with or without reserved browser bars", () => {
  const screens = [
    [1366, 768],
    [1536, 864],
    [1280, 720],
    [1920, 1080],
    [1512, 982],
    [1210, 834],
    [1376, 1032],
    [390, 844],
  ];
  for (const [availableWidth, screenHeight] of screens) {
    for (const bars of [0, 120]) {
      const availableHeight = screenHeight - bars;
      const fit = fitStudyViewport(availableWidth, availableHeight);
      assert.ok(fit.scale > 0 && fit.scale <= 1);
      assert.ok(fit.width >= 1512 && fit.height >= 862);
      assert.ok(fit.width * fit.scale <= availableWidth + 1e-6);
      assert.ok(fit.height * fit.scale <= availableHeight + 1e-6);
      // At least one edge fills the available viewport; both axes use that scale.
      assert.ok(
        Math.abs(fit.width * fit.scale - availableWidth) < 1e-6 ||
          Math.abs(fit.height * fit.scale - availableHeight) < 1e-6,
      );
    }
  }
  assert.equal(fitStudyViewport(1366, 648).scale, 648 / 862);
  assert.equal(fitStudyViewport(1210, 714).scale, 1210 / 1512);
});
