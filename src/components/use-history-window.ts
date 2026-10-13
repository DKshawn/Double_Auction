"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  historyAnchorTop,
  historyOffsets,
  historyRowAt,
  historyWindow,
} from "@/lib/history-window";

export function useHistoryWindow(ids: string[], estimate: number) {
  const list = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ id: string; inset: number } | null>(null);
  const atEnd = useRef(false);
  const previousTop = useRef(0);
  const [viewport, setViewport] = useState({ top: 0, height: 420 });
  const [measurements, setMeasurements] = useState(() => ({
    width: 0,
    heights: new Map<string, number>(),
  }));
  const offsets = useMemo(
    () => historyOffsets(ids, measurements.heights, estimate),
    [ids, measurements.heights, estimate],
  );
  const range = historyWindow(offsets, viewport.top, viewport.height);

  const readViewport = useCallback(() => {
    const element = list.current;
    if (!element) return;
    const top = element.scrollTop;
    const height = Math.max(
      0,
      element.clientHeight -
        (element.querySelector("thead")?.offsetHeight ?? 0),
    );
    setViewport((previous) =>
      previous.top === top && previous.height === height
        ? previous
        : { top, height },
    );
  }, []);

  const onScroll = useCallback(() => {
    const element = list.current;
    if (!element) return;
    const top = element.scrollTop;
    atEnd.current =
      top > 1 &&
      ((atEnd.current && top >= previousTop.current) ||
        top + element.clientHeight >= element.scrollHeight - 1);
    previousTop.current = top;
    const index = historyRowAt(offsets, top);
    anchor.current =
      top > 1 && ids[index]
        ? { id: ids[index], inset: top - offsets[index] }
        : null;
    readViewport();
  }, [ids, offsets, readViewport]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    // Native smooth End scrolling can be interrupted by newly measured rows.
    // Jump directly, and keep the bottom reachable while their heights settle.
    event.currentTarget.scrollTop =
      event.key === "End" ? event.currentTarget.scrollHeight : 0;
    onScroll();
  };

  // Keep a reader on the same record when rows arrive above it or measured
  // heights change. At the top, new arrivals remain visible automatically.
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    element.scrollTop = atEnd.current
      ? element.scrollHeight
      : historyAnchorTop(ids, offsets, anchor.current);
    readViewport();
  }, [ids, offsets, readViewport]);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = element.clientWidth;
      setMeasurements((previous) => {
        const resized = previous.width !== width;
        let heights = resized ? new Map<string, number>() : previous.heights;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.historyId;
          // borderBoxSize is unaffected by the preview iframe's scale.
          const height = entry.borderBoxSize[0]?.blockSize;
          if (!id || !height || heights.get(id) === height) continue;
          if (heights === previous.heights) heights = new Map(heights);
          heights.set(id, height);
        }
        return heights === previous.heights ? previous : { width, heights };
      });
      readViewport();
    });
    observer.observe(element);
    const heading = element.querySelector("thead");
    if (heading) observer.observe(heading);
    element.querySelectorAll("tr[data-history-id]").forEach((row) => {
      observer.observe(row);
    });
    return () => observer.disconnect();
  }, [ids, range.start, range.end, readViewport]);

  return { list, onScroll, onKeyDown, ...range };
}
