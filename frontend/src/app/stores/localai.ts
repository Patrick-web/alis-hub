import { create } from "zustand";
import { Events } from "@wailsio/runtime";
import * as LocalAIService from "../../../bindings/alis-hub-v3/localaiservice";
import * as settingsClient from "../lib/settingsClient";
import { onSettingsReady } from "./lib/persistSqlite";
import { wireOnce } from "./lib/wireOnce";

export type LocalAIModel = "gemma4:e2b" | "gemma4:12b";

export interface PullProgress {
  status: string;
  completed: number;
  total: number;
}

export interface LocalAIState {
  enabled: boolean;
  model: LocalAIModel;
  // Ollama binary phase
  binaryReady: boolean;
  binaryDownloading: boolean;
  binaryDownloadPct: number;
  binaryDownloadLabel: string;
  binaryError: string | null;
  // Ollama process phase
  ollamaRunning: boolean;
  ollamaStarting: boolean;
  ollamaError: string | null;
  // Model download phase
  modelPulled: boolean;
  pulling: boolean;
  pullProgress: PullProgress | null;
  pullError: string | null;
  // Generation phase
  activeRequests: number;
}

interface LocalAIStore {
  state: LocalAIState;
  setEnabled: (enabled: boolean) => void;
  setModel: (model: LocalAIModel) => void;
  startDownloadBinary: () => void;
  startOllama: () => Promise<void>;
  startPull: () => void;
  refresh: () => Promise<void>;
  generate: (model: string, systemPrompt: string, userPrompt: string) => Promise<string>;
  generateCommitMessage: (repoPath: string, model: string) => Promise<string>;
}

const STORAGE_KEY = "alis:localai";
const DEFAULT_MODEL: LocalAIModel = "gemma4:e2b";

const INITIAL_STATE: LocalAIState = {
  enabled: false,
  model: DEFAULT_MODEL,
  binaryReady: false,
  binaryDownloading: false,
  binaryDownloadPct: 0,
  binaryDownloadLabel: "",
  binaryError: null,
  ollamaRunning: false,
  ollamaStarting: false,
  ollamaError: null,
  modelPulled: false,
  pulling: false,
  pullProgress: null,
  pullError: null,
  activeRequests: 0,
};

function loadFromStorage(): Pick<LocalAIState, "enabled" | "model"> {
  try {
    const raw = settingsClient.getCached(STORAGE_KEY);
    if (!raw) return { enabled: false, model: DEFAULT_MODEL };
    const parsed = JSON.parse(raw);
    const model = parsed.model === "gemma4:12b" ? "gemma4:12b" : "gemma4:e2b";
    return { enabled: parsed.enabled ?? false, model };
  } catch {
    return { enabled: false, model: DEFAULT_MODEL };
  }
}

// Only enabled/model are persisted, in the same flat shape the pre-zustand
// store wrote, so the write happens manually in the two setters below.
function persistPrefs(enabled: boolean, model: LocalAIModel) {
  settingsClient.set(STORAGE_KEY, JSON.stringify({ enabled, model }));
}

function patch(partial: Partial<LocalAIState>) {
  useLocalAI.setState((s) => ({ state: { ...s.state, ...partial } }));
}

async function fetchStatus(model: LocalAIModel) {
  const status = await LocalAIService.GetOllamaStatus().catch(() => ({
    binaryReady: false,
    running: false,
  }));
  let modelPulled = false;
  if (status.running) {
    const models = await LocalAIService.GetPulledModels().catch(() => [] as string[]);
    modelPulled = models.some((m) => m === model);
  }
  return { binaryReady: status.binaryReady, ollamaRunning: status.running, modelPulled };
}

export const useLocalAI = create<LocalAIStore>((set, get) => ({
  state: INITIAL_STATE,
  setEnabled: (enabled) => {
    set((s) => ({ state: { ...s.state, enabled } }));
    persistPrefs(enabled, get().state.model);
  },
  setModel: (model) => {
    set((s) => ({ state: { ...s.state, model, modelPulled: false } }));
    persistPrefs(get().state.enabled, model);
  },
  startDownloadBinary: () => {
    set((s) => ({
      state: {
        ...s.state,
        binaryDownloading: true,
        binaryError: null,
        binaryDownloadPct: 0,
        binaryDownloadLabel: "",
      },
    }));
    LocalAIService.DownloadOllamaBinary();
  },
  startOllama: async () => {
    set((s) => ({ state: { ...s.state, ollamaStarting: true, ollamaError: null } }));
    try {
      await LocalAIService.StartOllama();
      set((s) => ({ state: { ...s.state, ollamaRunning: true, ollamaStarting: false } }));
    } catch (e) {
      set((s) => ({ state: { ...s.state, ollamaStarting: false, ollamaError: String(e) } }));
    }
  },
  startPull: () => {
    set((s) => ({ state: { ...s.state, pulling: true, pullProgress: null, pullError: null } }));
    LocalAIService.PullModel(get().state.model);
  },
  refresh: async () => {
    const status = await fetchStatus(get().state.model);
    set((s) => ({ state: { ...s.state, ...status } }));
  },
  generate: async (model, systemPrompt, userPrompt) => {
    set((s) => ({ state: { ...s.state, activeRequests: s.state.activeRequests + 1 } }));
    try {
      return await LocalAIService.Generate(model, systemPrompt, userPrompt);
    } finally {
      set((s) => ({
        state: { ...s.state, activeRequests: Math.max(0, s.state.activeRequests - 1) },
      }));
    }
  },
  generateCommitMessage: async (repoPath, model) => {
    set((s) => ({ state: { ...s.state, activeRequests: s.state.activeRequests + 1 } }));
    try {
      return await LocalAIService.GenerateCommitMessage(repoPath, model);
    } finally {
      set((s) => ({
        state: { ...s.state, activeRequests: Math.max(0, s.state.activeRequests - 1) },
      }));
    }
  },
}));

wireOnce("localai:events", () => {
  // Binary download
  Events.On("localai:ollama-download-progress", (ev: any) => {
    const d = ev?.data ?? ev;
    patch({ binaryDownloadPct: d?.pct ?? 0, binaryDownloadLabel: d?.label ?? "" });
  });
  Events.On("localai:ollama-download-done", () => {
    patch({ binaryDownloading: false, binaryReady: true, binaryDownloadPct: 100 });
  });
  Events.On("localai:ollama-download-error", (ev: any) => {
    const d = ev?.data ?? ev;
    patch({ binaryDownloading: false, binaryError: d?.error ?? "Download failed" });
  });
  // Model pull
  Events.On("localai:pull-progress", (ev: any) => {
    const d = ev?.data ?? ev;
    patch({
      pullProgress: { status: d?.status ?? "", completed: d?.completed ?? 0, total: d?.total ?? 0 },
    });
  });
  Events.On("localai:pull-done", () => {
    patch({ pulling: false, pullProgress: null, modelPulled: true });
  });
  Events.On("localai:pull-error", (ev: any) => {
    const d = ev?.data ?? ev;
    patch({ pulling: false, pullError: d?.error ?? "Unknown error" });
  });
});

// Seed persisted prefs, check status, and auto-start Ollama once at bootstrap
onSettingsReady(() => {
  const prefs = loadFromStorage();
  patch(prefs);

  void (async () => {
    const status = await fetchStatus(prefs.model);
    patch(status);

    // Auto-start if enabled and binary is present but Ollama isn't running
    if (prefs.enabled && status.binaryReady && !status.ollamaRunning) {
      patch({ ollamaStarting: true, ollamaError: null });
      LocalAIService.StartOllama()
        .then(() => patch({ ollamaRunning: true, ollamaStarting: false }))
        .catch(() => patch({ ollamaRunning: false, ollamaStarting: false }));
    }
  })();
});
