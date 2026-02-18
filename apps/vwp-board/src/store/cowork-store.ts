"use client";

import { create } from "zustand";
import { kanbanApi } from "@/lib/api-client";

// --- Types ---

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  createdAt: number;
}

export interface CoworkSession {
  id: string;
  projectId: string;
  status: "running" | "paused" | "completed" | "failed";
  startedAt: number;
}

export interface CoworkOptions {
  model?: string;
  permissionMode?: "acceptEdits" | "bypassPermissions";
  maxBudgetUsd?: number;
  maxTurns?: number;
}

export interface ToolUseEntry {
  tool: string;
  input: string;
  output?: string;
  timestamp: number;
}

// SSE event shapes the cowork store handles
export type CoworkSSEEvent =
  | { type: "cowork_started"; sessionId: string; projectId: string }
  | { type: "cowork_text"; sessionId: string; text: string }
  | { type: "cowork_tool_use"; sessionId: string; tool: string; input: string }
  | { type: "cowork_tool_result"; sessionId: string; tool: string; output: string }
  | { type: "cowork_completed"; sessionId: string; result: string; costUsd: number }
  | { type: "cowork_error"; sessionId: string; error: string }
  | { type: "cowork_approval_needed"; sessionId: string; tool: string; description: string };

export interface ApprovalRequest {
  tool: string;
  description: string;
  timestamp: number;
}

export interface CoworkStore {
  // Project management
  projects: Project[];
  selectedProjectId: string | null;
  projectsLoading: boolean;
  projectError: string | null;

  // Session state
  activeSession: CoworkSession | null;
  streamTokens: string[];
  toolUses: ToolUseEntry[];
  sessionResult: string | null;
  sessionCostUsd: number | null;
  sessionError: string | null;
  approvalRequest: ApprovalRequest | null;

  // Actions
  fetchProjects: () => Promise<void>;
  registerProject: (name: string, rootPath: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  selectProject: (id: string | null) => void;
  startSession: (projectId: string, prompt: string, options?: CoworkOptions) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  cancelSession: () => Promise<void>;
  clearSession: () => void;

  // SSE handler
  handleCoworkEvent: (event: unknown) => void;
}

// Throttle helper for streaming tokens (matches chat-store pattern)
let _coworkStreamBuffer = "";
let _coworkFlushTimer: ReturnType<typeof setTimeout> | null = null;
const STREAM_THROTTLE_MS = 100;

function flushCoworkStreamBuffer(set: (partial: Partial<CoworkStore>) => void) {
  if (_coworkStreamBuffer.length > 0) {
    const buffered = _coworkStreamBuffer;
    _coworkStreamBuffer = "";
    set({
      streamTokens: [...useCoworkStore.getState().streamTokens, buffered],
    });
  }
  _coworkFlushTimer = null;
}

function appendCoworkToken(
  token: string,
  set: (partial: Partial<CoworkStore>) => void,
) {
  _coworkStreamBuffer += token;
  if (!_coworkFlushTimer) {
    _coworkFlushTimer = setTimeout(
      () => flushCoworkStreamBuffer(set),
      STREAM_THROTTLE_MS,
    );
  }
}

export const useCoworkStore = create<CoworkStore>((set, get) => ({
  // Initial state
  projects: [],
  selectedProjectId: null,
  projectsLoading: false,
  projectError: null,

  activeSession: null,
  streamTokens: [],
  toolUses: [],
  sessionResult: null,
  sessionCostUsd: null,
  sessionError: null,
  approvalRequest: null,

  fetchProjects: async () => {
    set({ projectsLoading: true, projectError: null });
    try {
      const data = await kanbanApi.getProjects();
      set({ projects: data.projects, projectsLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ projectError: msg, projectsLoading: false });
    }
  },

  registerProject: async (name, rootPath) => {
    set({ projectError: null });
    try {
      const data = await kanbanApi.registerProject(name, rootPath);
      set((state) => ({
        projects: [...state.projects, data.project],
        selectedProjectId: data.project.id,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ projectError: msg });
    }
  },

  removeProject: async (id) => {
    try {
      await kanbanApi.removeProject(id);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ projectError: msg });
    }
  },

  selectProject: (id) => {
    set({ selectedProjectId: id });
  },

  startSession: async (projectId, prompt, options) => {
    set({
      streamTokens: [],
      toolUses: [],
      sessionResult: null,
      sessionCostUsd: null,
      sessionError: null,
      approvalRequest: null,
    });
    try {
      const data = await kanbanApi.startCowork(projectId, prompt, options);
      set({
        activeSession: {
          id: data.sessionId,
          projectId,
          status: "running",
          startedAt: Date.now(),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ sessionError: msg });
    }
  },

  sendMessage: async (message) => {
    try {
      await kanbanApi.sendCoworkMessage(message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ sessionError: msg });
    }
  },

  cancelSession: async () => {
    try {
      await kanbanApi.cancelCowork();
      set((state) => ({
        activeSession: state.activeSession
          ? { ...state.activeSession, status: "failed" as const }
          : null,
      }));
    } catch {
      // Cancel is best-effort
    }
  },

  clearSession: () => {
    set({
      activeSession: null,
      streamTokens: [],
      toolUses: [],
      sessionResult: null,
      sessionCostUsd: null,
      sessionError: null,
      approvalRequest: null,
    });
  },

  handleCoworkEvent: (event) => {
    const ev = event as CoworkSSEEvent;

    switch (ev.type) {
      case "cowork_started": {
        set({
          activeSession: {
            id: ev.sessionId,
            projectId: ev.projectId,
            status: "running",
            startedAt: Date.now(),
          },
          streamTokens: [],
          toolUses: [],
          sessionResult: null,
          sessionCostUsd: null,
          sessionError: null,
          approvalRequest: null,
        });
        break;
      }

      case "cowork_text": {
        appendCoworkToken(ev.text, set);
        break;
      }

      case "cowork_tool_use": {
        set((state) => ({
          toolUses: [
            ...state.toolUses,
            { tool: ev.tool, input: ev.input, timestamp: Date.now() },
          ],
        }));
        break;
      }

      case "cowork_tool_result": {
        set((state) => {
          const toolUses = [...state.toolUses];
          // Find the most recent tool_use for this tool and attach the result
          for (let i = toolUses.length - 1; i >= 0; i--) {
            if (toolUses[i].tool === ev.tool && !toolUses[i].output) {
              toolUses[i] = { ...toolUses[i], output: ev.output };
              break;
            }
          }
          return { toolUses };
        });
        break;
      }

      case "cowork_completed": {
        // Flush any remaining stream buffer
        if (_coworkStreamBuffer.length > 0) {
          const buffered = _coworkStreamBuffer;
          _coworkStreamBuffer = "";
          set((state) => ({
            streamTokens: [...state.streamTokens, buffered],
          }));
        }
        set((state) => ({
          activeSession: state.activeSession
            ? { ...state.activeSession, status: "completed" as const }
            : null,
          sessionResult: ev.result,
          sessionCostUsd: ev.costUsd,
        }));
        break;
      }

      case "cowork_error": {
        set((state) => ({
          activeSession: state.activeSession
            ? { ...state.activeSession, status: "failed" as const }
            : null,
          sessionError: ev.error,
        }));
        break;
      }

      case "cowork_approval_needed": {
        set({
          approvalRequest: {
            tool: ev.tool,
            description: ev.description,
            timestamp: Date.now(),
          },
        });
        break;
      }
    }
  },
}));

// Expose store on window for E2E testing
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__coworkStore = useCoworkStore;
}
