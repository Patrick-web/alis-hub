import {
  createContext,
  useContext,
  useCallback,
  useReducer,
  useEffect,
  type ReactNode,
} from "react";
import { Events } from "@wailsio/runtime";
import * as LocalAIService from "../../../bindings/alis-hub-v3/localaiservice";
import * as settingsClient from "../lib/settingsClient";

export type LocalAIModel = "gemma4:e2b" | "gemma4:12b";

export interface PullProgress {
  status: string;
  completed: number;
  total: number;
}

interface LocalAIState {
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

type LocalAIAction =
  | { type: "SET_ENABLED"; payload: boolean }
  | { type: "SET_MODEL"; payload: LocalAIModel }
  | {
      type: "SET_STATUS";
      payload: { binaryReady: boolean; ollamaRunning: boolean; modelPulled: boolean };
    }
  | { type: "BINARY_DOWNLOAD_START" }
  | { type: "BINARY_DOWNLOAD_PROGRESS"; payload: { pct: number; label: string } }
  | { type: "BINARY_DOWNLOAD_DONE" }
  | { type: "BINARY_DOWNLOAD_ERROR"; payload: string }
  | { type: "OLLAMA_STARTING" }
  | { type: "OLLAMA_RUNNING"; payload: boolean }
  | { type: "OLLAMA_ERROR"; payload: string }
  | { type: "PULL_START" }
  | { type: "PULL_PROGRESS"; payload: PullProgress }
  | { type: "PULL_DONE" }
  | { type: "PULL_ERROR"; payload: string }
  | { type: "GENERATE_START" }
  | { type: "GENERATE_END" };

interface LocalAIContextValue {
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

function getInitialState(): LocalAIState {
  const persisted = loadFromStorage();
  return {
    ...persisted,
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
}

function reducer(state: LocalAIState, action: LocalAIAction): LocalAIState {
  switch (action.type) {
    case "SET_ENABLED":
      return { ...state, enabled: action.payload };
    case "SET_MODEL":
      return { ...state, model: action.payload, modelPulled: false };
    case "SET_STATUS":
      return {
        ...state,
        binaryReady: action.payload.binaryReady,
        ollamaRunning: action.payload.ollamaRunning,
        modelPulled: action.payload.modelPulled,
      };
    case "BINARY_DOWNLOAD_START":
      return {
        ...state,
        binaryDownloading: true,
        binaryError: null,
        binaryDownloadPct: 0,
        binaryDownloadLabel: "",
      };
    case "BINARY_DOWNLOAD_PROGRESS":
      return {
        ...state,
        binaryDownloadPct: action.payload.pct,
        binaryDownloadLabel: action.payload.label,
      };
    case "BINARY_DOWNLOAD_DONE":
      return { ...state, binaryDownloading: false, binaryReady: true, binaryDownloadPct: 100 };
    case "BINARY_DOWNLOAD_ERROR":
      return { ...state, binaryDownloading: false, binaryError: action.payload };
    case "OLLAMA_STARTING":
      return { ...state, ollamaStarting: true, ollamaError: null };
    case "OLLAMA_RUNNING":
      return { ...state, ollamaRunning: action.payload, ollamaStarting: false };
    case "OLLAMA_ERROR":
      return { ...state, ollamaStarting: false, ollamaError: action.payload };
    case "PULL_START":
      return { ...state, pulling: true, pullProgress: null, pullError: null };
    case "PULL_PROGRESS":
      return { ...state, pullProgress: action.payload };
    case "PULL_DONE":
      return { ...state, pulling: false, pullProgress: null, modelPulled: true };
    case "PULL_ERROR":
      return { ...state, pulling: false, pullError: action.payload };
    case "GENERATE_START":
      return { ...state, activeRequests: state.activeRequests + 1 };
    case "GENERATE_END":
      return { ...state, activeRequests: Math.max(0, state.activeRequests - 1) };
    default:
      return state;
  }
}

const LocalAIContext = createContext<LocalAIContextValue | null>(null);

export function LocalAIProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState);

  useEffect(() => {
    settingsClient.set(STORAGE_KEY, JSON.stringify({ enabled: state.enabled, model: state.model }));
  }, [state.enabled, state.model]);

  const refresh = useCallback(async () => {
    const status = await LocalAIService.GetOllamaStatus().catch(() => ({
      binaryReady: false,
      running: false,
    }));
    let modelPulled = false;
    if (status.running) {
      const models = await LocalAIService.GetPulledModels().catch(() => [] as string[]);
      modelPulled = models.some((m) => m === state.model);
    }
    dispatch({
      type: "SET_STATUS",
      payload: { binaryReady: status.binaryReady, ollamaRunning: status.running, modelPulled },
    });
  }, [state.model]);

  // On mount: check status and auto-start Ollama if binary is ready and feature is enabled
  useEffect(() => {
    (async () => {
      const status = await LocalAIService.GetOllamaStatus().catch(() => ({
        binaryReady: false,
        running: false,
      }));
      let modelPulled = false;
      if (status.running) {
        const models = await LocalAIService.GetPulledModels().catch(() => [] as string[]);
        modelPulled = models.some((m) => m === state.model);
      }
      dispatch({
        type: "SET_STATUS",
        payload: { binaryReady: status.binaryReady, ollamaRunning: status.running, modelPulled },
      });

      // Auto-start if enabled and binary is present but Ollama isn't running
      if (state.enabled && status.binaryReady && !status.running) {
        dispatch({ type: "OLLAMA_STARTING" });
        LocalAIService.StartOllama()
          .then(() => dispatch({ type: "OLLAMA_RUNNING", payload: true }))
          .catch(() => dispatch({ type: "OLLAMA_RUNNING", payload: false }));
      }
    })();
  }, []);

  // Event listeners for binary download
  useEffect(() => {
    const offProg = Events.On("localai:ollama-download-progress", (ev: any) => {
      const d = ev?.data ?? ev;
      dispatch({
        type: "BINARY_DOWNLOAD_PROGRESS",
        payload: { pct: d?.pct ?? 0, label: d?.label ?? "" },
      });
    });
    const offDone = Events.On("localai:ollama-download-done", () => {
      dispatch({ type: "BINARY_DOWNLOAD_DONE" });
    });
    const offErr = Events.On("localai:ollama-download-error", (ev: any) => {
      const d = ev?.data ?? ev;
      dispatch({ type: "BINARY_DOWNLOAD_ERROR", payload: d?.error ?? "Download failed" });
    });
    return () => {
      offProg();
      offDone();
      offErr();
    };
  }, []);

  // Event listeners for model pull
  useEffect(() => {
    const offProgress = Events.On("localai:pull-progress", (ev: any) => {
      const d = ev?.data ?? ev;
      dispatch({
        type: "PULL_PROGRESS",
        payload: { status: d?.status ?? "", completed: d?.completed ?? 0, total: d?.total ?? 0 },
      });
    });
    const offDone = Events.On("localai:pull-done", () => dispatch({ type: "PULL_DONE" }));
    const offError = Events.On("localai:pull-error", (ev: any) => {
      const d = ev?.data ?? ev;
      dispatch({ type: "PULL_ERROR", payload: d?.error ?? "Unknown error" });
    });
    return () => {
      offProgress();
      offDone();
      offError();
    };
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: "SET_ENABLED", payload: enabled });
  }, []);

  const setModel = useCallback((model: LocalAIModel) => {
    dispatch({ type: "SET_MODEL", payload: model });
  }, []);

  const startDownloadBinary = useCallback(() => {
    dispatch({ type: "BINARY_DOWNLOAD_START" });
    LocalAIService.DownloadOllamaBinary();
  }, []);

  const startOllama = useCallback(async () => {
    dispatch({ type: "OLLAMA_STARTING" });
    try {
      await LocalAIService.StartOllama();
      dispatch({ type: "OLLAMA_RUNNING", payload: true });
    } catch (e: any) {
      dispatch({ type: "OLLAMA_ERROR", payload: String(e) });
    }
  }, []);

  const startPull = useCallback(() => {
    dispatch({ type: "PULL_START" });
    LocalAIService.PullModel(state.model);
  }, [state.model]);

  const generate = useCallback(async (model: string, systemPrompt: string, userPrompt: string) => {
    dispatch({ type: "GENERATE_START" });
    try {
      return await LocalAIService.Generate(model, systemPrompt, userPrompt);
    } finally {
      dispatch({ type: "GENERATE_END" });
    }
  }, []);

  const generateCommitMessage = useCallback(async (repoPath: string, model: string) => {
    dispatch({ type: "GENERATE_START" });
    try {
      return await LocalAIService.GenerateCommitMessage(repoPath, model);
    } finally {
      dispatch({ type: "GENERATE_END" });
    }
  }, []);

  return (
    <LocalAIContext.Provider
      value={{
        state,
        setEnabled,
        setModel,
        startDownloadBinary,
        startOllama,
        startPull,
        refresh,
        generate,
        generateCommitMessage,
      }}
    >
      {children}
    </LocalAIContext.Provider>
  );
}

export function useLocalAI() {
  const ctx = useContext(LocalAIContext);
  if (!ctx) throw new Error("useLocalAI must be used within LocalAIProvider");
  return ctx;
}
