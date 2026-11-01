// Row offsets are in CSS pixels. Keep all data, but mount only the visible
// interval plus a few rows on either side of it.
export function historyOffsets(
  ids: readonly string[],
  heights: ReadonlyMap<string, number>,
  estimate = 24,
): number[] {
  const offsets = [0];
  for (const id of ids)
    offsets.push(offsets[offsets.length - 1] + (heights.get(id) ?? estimate));
  return offsets;
}

export function historyRowAt(offsets: readonly number[], top: number): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= top) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function historyWindow(
  offsets: readonly number[],
  top: number,
  height: number,
  overscan = 8,
) {
  const count = offsets.length - 1;
  const start = Math.max(0, historyRowAt(offsets, top) - overscan);
  const end = Math.min(
    count,
    historyRowAt(offsets, top + Math.max(0, height)) + overscan + 1,
  );
  return {
    start,
    end,
    before: offsets[start],
    after: offsets[count] - offsets[end],
  };
}

export function historyAnchorTop(
  ids: readonly string[],
  offsets: readonly number[],
  anchor: { id: string; inset: number } | null,
): number {
  if (!anchor) return 0;
  const index = ids.indexOf(anchor.id);
  return index < 0 ? 0 : Math.max(0, offsets[index] + anchor.inset);
}
