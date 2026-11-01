import type { RoomView } from "./types";

type Path = (string | number)[];
export type Change =
  | { op: "set"; path: Path; value: unknown }
  | { op: "remove"; path: Path }
  | {
      op: "splice";
      path: Path;
      start: number;
      deleteCount: number;
      items: unknown[];
    };
export type RoomPatch = { base: number; version: number; changes: Change[] };

// Diff authorized views, never database state or audit events. Immutable history
// arrays append in one operation; live books and teacher market rows change in place.
export function diffViews(before: RoomView, after: RoomView): RoomPatch {
  const changes: Change[] = [];
  function visit(a: unknown, b: unknown, path: Path) {
    if (Object.is(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const start = changes.length;
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) visit(a[i], b[i], [...path, i]);
      if (a.length !== b.length)
        changes.push({
          op: "splice",
          path,
          start: n,
          deleteCount: a.length - n,
          items: b.slice(n),
        });
      // A small live book can be cheaper to replace than a long list of field
      // edits when entries disappear. Never serialize long history arrays here.
      if (
        ["orders", "myOrders", "offers", "quotes"].includes(
          String(path.at(-1)),
        ) &&
        changes.length - start > 1
      ) {
        const replacement: Change = { op: "set", path, value: b };
        if (
          JSON.stringify([replacement]).length <
          JSON.stringify(changes.slice(start)).length
        )
          changes.splice(start, changes.length - start, replacement);
      }
    } else if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      const left = a as Record<string, unknown>,
        right = b as Record<string, unknown>;
      for (const key of Object.keys(left))
        if (!(key in right))
          changes.push({ op: "remove", path: [...path, key] });
      for (const key of Object.keys(right))
        visit(left[key], right[key], [...path, key]);
    } else changes.push({ op: "set", path, value: b });
  }
  visit(before, after, []);
  return { base: before.version, version: after.version, changes };
}

export function applyPatch(view: RoomView, patch: RoomPatch): RoomView {
  if (view.version !== patch.base || patch.version < patch.base)
    throw new Error("Snapshot required");
  // Copy only paths touched by this patch. Long immutable histories are shared.
  const result = { ...view };
  const owned = new WeakSet<object>([result]);
  const ownChild = (
    parent: Record<string | number, unknown>,
    key: string | number,
  ) => {
    const child = parent[key];
    if (child && typeof child === "object" && !owned.has(child)) {
      parent[key] = Array.isArray(child) ? child.slice() : { ...child };
      owned.add(parent[key] as object);
    }
    return parent[key];
  };
  for (const change of patch.changes) {
    if (
      !change.path.length ||
      change.path.some((key) =>
        ["__proto__", "constructor", "prototype"].includes(String(key)),
      )
    )
      throw new Error("Invalid patch path");
    let parent: Record<string | number, unknown> = result as unknown as Record<
      string,
      unknown
    >;
    for (const key of change.path.slice(0, -1)) {
      if (
        !Object.hasOwn(parent, key) ||
        !parent[key] ||
        typeof parent[key] !== "object"
      )
        throw new Error("Invalid patch path");
      parent = ownChild(parent, key) as typeof parent;
    }
    const key = change.path.at(-1)!;
    if (change.op === "set") parent[key] = structuredClone(change.value);
    else if (change.op === "remove") delete parent[key];
    else {
      const array = ownChild(parent, key);
      if (
        !Array.isArray(array) ||
        change.start < 0 ||
        change.start > array.length ||
        change.deleteCount < 0
      )
        throw new Error("Invalid patch range");
      array.splice(
        change.start,
        change.deleteCount,
        ...structuredClone(change.items),
      );
    }
  }
  if (result.version !== patch.version)
    throw new Error("Invalid patch version");
  return result;
}
