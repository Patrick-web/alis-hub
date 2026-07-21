import { useCallback, useEffect, useRef } from "react";

export interface ShortcutDef {
  id: string;
  keys: string;
  handler: () => void;
  scope?: string;
  description: string;
  group?: string;
}

type Subscription = { id: string; def: ShortcutDef };

class ShortcutRegistry {
  private subs: Subscription[] = [];

  register(def: ShortcutDef): () => void {
    const sub: Subscription = { id: def.id, def };
    this.subs.push(sub);
    return () => {
      this.subs = this.subs.filter((s) => s.id !== def.id);
    };
  }

  /** Returns all active registrations (for discoverability). */
  getAll(): ShortcutDef[] {
    return this.subs.map((s) => s.def);
  }

  findMatch(e: KeyboardEvent, currentScope: string | null): ShortcutDef | null {
    for (const sub of this.subs) {
      if (matches(e, sub.def.keys)) {
        if (sub.def.scope && currentScope && sub.def.scope !== currentScope) continue;
        if (!sub.def.scope && hasModifier(sub.def.keys) === false && isEditableTarget(e)) continue;
        return sub.def;
      }
    }
    return null;
  }
}

const registry = new ShortcutRegistry();

function parseKeys(keys: string) {
  const parts = keys
    .toLowerCase()
    .split("+")
    .map((p) => p.trim());
  const modifiers = new Set(
    parts.filter((p) => ["ctrl", "meta", "cmd", "alt", "shift"].includes(p)),
  );
  const key = parts.find((p) => !["ctrl", "meta", "cmd", "alt", "shift"].includes(p)) ?? "";
  return { modifiers, key };
}

function matches(e: KeyboardEvent, keys: string): boolean {
  const { modifiers, key } = parseKeys(keys);
  if (!key || e.key.toLowerCase() !== key) return false;

  const wantsCtrl = modifiers.has("ctrl");
  const wantsMeta = modifiers.has("meta") || modifiers.has("cmd");
  const wantsAlt = modifiers.has("alt");
  const wantsShift = modifiers.has("shift");

  if (wantsShift !== e.shiftKey) return false;
  if (wantsAlt !== e.altKey) return false;

  if (wantsCtrl && !wantsMeta && e.metaKey && !e.ctrlKey) return false;
  if (wantsMeta && !e.metaKey) return false;
  if (!wantsCtrl && !wantsMeta && (e.ctrlKey || e.metaKey)) return false;

  return true;
}

function hasModifier(keys: string): boolean {
  return ["ctrl", "meta", "cmd", "alt"].some((m) => keys.toLowerCase().includes(m));
}

function isEditableTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

let listenerInstalled = false;

function installListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;

  document.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const route = window.location.pathname;
      const match = registry.findMatch(e, route);
      if (match) {
        e.preventDefault();
        e.stopPropagation();
        match.handler();
      }
    },
    true,
  );
}

/**
 * Register one or more keyboard shortcuts. Automatically unregisters when the
 * component unmounts or when `deps` change.
 *
 * Shortcuts with modifiers (Ctrl, Cmd, Alt, Shift) always fire regardless of
 * focus. Shortcuts without modifiers are suppressed when an input/textarea is
 * focused to avoid interfering with typing.
 *
 * The `scope` field restricts a shortcut to a specific route path (e.g. "/git").
 * If omitted the shortcut is global.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDef[], deps: unknown[] = []) {
  const registeredRef = useRef<Array<() => void>>([]);

  const registerAll = useCallback(() => {
    registeredRef.current.forEach((unreg) => unreg());
    registeredRef.current = [];
    installListener();
    for (const s of shortcuts) {
      registeredRef.current.push(registry.register(s));
    }
  }, shortcuts);

  useEffect(() => {
    registerAll();
    return () => {
      registeredRef.current.forEach((unreg) => unreg());
      registeredRef.current = [];
    };
  }, deps);

  return { getAll: () => registry.getAll() };
}

export function getShortcutRegistry() {
  return registry;
}
