import type { PendingPaneOpen } from "../stores/notifications";

const DEEP_LINK_SCHEME = "alishub://";

export interface DevelopDeepLink {
  route: "/develop";
  params: PendingPaneOpen;
}

export type ParsedDeepLink = DevelopDeepLink;

export function parseDeepLink(url: string): ParsedDeepLink | null {
  if (!url || !url.startsWith(DEEP_LINK_SCHEME)) return null;

  const raw = url.slice(DEEP_LINK_SCHEME.length);
  if (!raw) return null;

  const [pathPart, queryPart] = raw.split("?", 2);
  const path = pathPart.replace(/\/$/, "");

  const params = new URLSearchParams(queryPart ?? "");

  if (path === "develop" || path === "") {
    const type = params.get("type") as PendingPaneOpen["type"] | null;
    const neuron = params.get("neuron");
    if (type && neuron && isPaneType(type)) {
      return { route: "/develop", params: { type, neuron } };
    }
  }

  return null;
}

export function buildDevelopDeepLink(type: PendingPaneOpen["type"], neuron: string): string {
  const params = new URLSearchParams({ type, neuron });
  return `${DEEP_LINK_SCHEME}develop?${params.toString()}`;
}

function isPaneType(value: string): value is PendingPaneOpen["type"] {
  return ["define", "build", "deploy", "packages"].includes(value);
}
