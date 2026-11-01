// MacBook Pro 14-inch logical screen, with 120px reserved for browser/OS bars.
export const STUDY_VIEWPORT_BASE = { width: 1512, height: 862 } as const;

export function fitStudyViewport(
  availableWidth: number,
  availableHeight: number,
) {
  const width = Math.max(STUDY_VIEWPORT_BASE.width, availableWidth);
  const height = Math.max(STUDY_VIEWPORT_BASE.height, availableHeight);
  return {
    width,
    height,
    scale: Math.min(1, availableWidth / width, availableHeight / height),
  };
}
