export const RELEASE_LEVEL_LABEL: Record<number, string> = {
  1: "Experimental",
  2: "Alpha",
  3: "Beta",
  4: "Release Candidate",
  5: "Stable",
};

export const RELEASE_LEVEL_COLOR: Record<number, string> = {
  1: "text-destructive border-destructive/30 bg-destructive/10",
  2: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  3: "text-warning border-warning/30 bg-warning/10",
  4: "text-info border-info/30 bg-info/10",
  5: "text-success border-success/30 bg-success/10",
};

export const RELEASE_LEVELS: { label: string; value: number }[] = [
  { label: "Stable", value: 5 },
  { label: "Release Candidate", value: 4 },
  { label: "Beta", value: 3 },
  { label: "Alpha", value: 2 },
  { label: "Experimental", value: 1 },
];

export const RELEASE_FILTER_LABELS = ["All", ...RELEASE_LEVELS.map((l) => l.label)] as const;

export const PUBLISH_RELEASE_LEVELS: { label: string; value: number }[] = [
  { label: "Stable", value: 99 },
  { label: "Release Candidate", value: 12 },
  { label: "Beta", value: 9 },
  { label: "Alpha", value: 6 },
  { label: "Experimental", value: 3 },
];

const _PUBLISH_LABEL_MAP: Record<number, string> = {};
const _PUBLISH_COLOR_MAP: Record<number, string> = {};
PUBLISH_RELEASE_LEVELS.forEach((l) => {
  const name = l.label;
  _PUBLISH_LABEL_MAP[l.value] = name;
  _PUBLISH_COLOR_MAP[l.value] =
    name === "Stable"
      ? RELEASE_LEVEL_COLOR[5]
      : name === "Release Candidate"
        ? RELEASE_LEVEL_COLOR[4]
        : name === "Beta"
          ? RELEASE_LEVEL_COLOR[3]
          : name === "Alpha"
            ? RELEASE_LEVEL_COLOR[2]
            : RELEASE_LEVEL_COLOR[1];
});

export const VERSION_RELEASE_LABEL: Record<number, string> = _PUBLISH_LABEL_MAP;
export const VERSION_RELEASE_COLOR: Record<number, string> = _PUBLISH_COLOR_MAP;
