// Web Crypto is available in both the browser and the Node.js runtime.
export const randomUUID = () => globalThis.crypto.randomUUID();

export function randomInt(max: number): number {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000)
    throw new RangeError("Invalid random integer range");
  const bound = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0] >= bound);
  return buffer[0] % max;
}
