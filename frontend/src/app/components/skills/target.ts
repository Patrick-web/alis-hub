import type { SkillInstallTarget } from "../../../../bindings/alis-hub-v3/models";

/**
 * Where a skill install lands.
 *
 * null is user scope, which is a real choice rather than an absent one: the CLI
 * has exactly two scopes and the panel makes the user pick between them.
 */
export type InstallTarget = SkillInstallTarget | null;

export function targetLabel(target: InstallTarget): string {
  return target ? `${target.org} · ${target.displayName}` : "user scope";
}
