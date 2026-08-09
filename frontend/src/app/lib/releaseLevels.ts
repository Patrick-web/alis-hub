/**
 * Block-level release levels (Block_ReleaseLevel). Note GA is 4 and RC is 5:
 * the block enum orders them the opposite way to the version enum below, which
 * runs 3/6/9/12/99.
 */
export const RELEASE_LEVEL_LABEL: Record<number, string> = {
  1: "Experimental",
  2: "Alpha",
  3: "Beta",
  4: "Stable",
  5: "Release Candidate",
};

export const RELEASE_LEVEL_COLOR: Record<number, string> = {
  1: "text-destructive border-destructive/30 bg-destructive/10",
  2: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  3: "text-warning border-warning/30 bg-warning/10",
  4: "text-success border-success/30 bg-success/10",
  5: "text-info border-info/30 bg-info/10",
};

export const RELEASE_LEVELS: { label: string; value: number }[] = [
  { label: "Stable", value: 4 },
  { label: "Release Candidate", value: 5 },
  { label: "Beta", value: 3 },
  { label: "Alpha", value: 2 },
  { label: "Experimental", value: 1 },
];

export const RELEASE_FILTER_LABELS = ["All", ...RELEASE_LEVELS.map((l) => l.label)] as const;

/**
 * Version-level release levels (BlockVersion_ReleaseLevel). `value` is the
 * number the Console API takes; `code` is the string the alis CLI's
 * --release-level flag takes. Both are needed: publishing goes through the CLI,
 * while CodeblockUpdatePage still contributes over the Console path.
 */
export const PUBLISH_RELEASE_LEVELS: { label: string; value: number; code: string }[] = [
  { label: "Stable", value: 99, code: "GA" },
  { label: "Release Candidate", value: 12, code: "RC" },
  { label: "Beta", value: 9, code: "BETA" },
  { label: "Alpha", value: 6, code: "ALPHA" },
  { label: "Experimental", value: 3, code: "EXPERIMENTAL" },
];

const _PUBLISH_CODE_MAP: Record<number, string> = {};
PUBLISH_RELEASE_LEVELS.forEach((l) => {
  _PUBLISH_CODE_MAP[l.value] = l.code;
});

/** Numeric release level to the CLI's string form, e.g. 99 -> "GA". */
export const PUBLISH_RELEASE_CODE: Record<number, string> = _PUBLISH_CODE_MAP;

// Keyed by label rather than by either enum's numbers, so the two release-level
// vocabularies stay visually consistent without one depending on the other's
// ordering.
const _COLOR_BY_LABEL: Record<string, string> = {
  Stable: "text-success border-success/30 bg-success/10",
  "Release Candidate": "text-info border-info/30 bg-info/10",
  Beta: "text-warning border-warning/30 bg-warning/10",
  Alpha: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  Experimental: "text-destructive border-destructive/30 bg-destructive/10",
};

const _PUBLISH_LABEL_MAP: Record<number, string> = {};
const _PUBLISH_COLOR_MAP: Record<number, string> = {};
PUBLISH_RELEASE_LEVELS.forEach((l) => {
  _PUBLISH_LABEL_MAP[l.value] = l.label;
  _PUBLISH_COLOR_MAP[l.value] = _COLOR_BY_LABEL[l.label];
});

export const VERSION_RELEASE_LABEL: Record<number, string> = _PUBLISH_LABEL_MAP;
export const VERSION_RELEASE_COLOR: Record<number, string> = _PUBLISH_COLOR_MAP;
