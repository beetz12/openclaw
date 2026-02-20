"use client";

import { create } from "zustand";
import type { ChatMessage, TeamConfig } from "@/types/chat";
import { kanbanApi } from "@/lib/api-client";

const STORAGE_KEY = "vwp-chat-messages";
const MAX_STORED = 200;
const MAX_RENDERED = 100;

/** SSE event shapes the chat store handles. */
export type ChatSSEEvent =
  | { type: "chat_message"; messageId: string; role: "assistant"; content: string; done: boolean }
  | { type: "chat_stream_token"; messageId: string; token: string }
  | {
      type: "chat_task_dispatched";
      messageId: string;
      taskId: string;
      title: string;
    }
  | {
      type: "chat_intent_clarify";
      messageId: string;
      question: string;
      options: string[];
    }
  | {
      type: "chat_team_suggest";
      messageId: string;
      role: string;
      description: string;
    }
  | { type: "chat_thinking"; messageId: string; status: "processing" | "queued"; elapsed_ms: number; position?: number };

export { MAX_RENDERED };

export interface ChatStore {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  gatewayConnected: boolean;
  onboardingComplete: boolean;
  teamConfig: TeamConfig | null;
  conversationId: string | null;
  isThinking: boolean;
  thinkingElapsedMs: number;
  thinkingMessageId: string | null;

  // Actions
  sendMessage: (text: string, asTask?: boolean) => Promise<void>;
  confirmTask: (messageId: string, taskId: string) => Promise<void>;
  cancelTask: (messageId: string, taskId: string) => Promise<void>;
  clarifyIntent: (messageId: string, choice: "chat" | "task") => void;
  acceptTeamMember: (role: string) => void;
  cancelChat: () => Promise<void>;
  loadHistory: (before?: string) => Promise<void>;
  clearHistory: () => void;
  handleChatSSEEvent: (event: unknown) => void;
  setGatewayConnected: (connected: boolean) => void;

  // Internal
  _loadFromStorage: () => void;
  _saveToStorage: () => void;
}

// Throttle helper: buffers streaming tokens and flushes at most every intervalMs
let _streamBuffer = "";
let _streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
const STREAM_THROTTLE_MS = 100;

function flushStreamBuffer(set: (partial: Partial<ChatStore>) => void) {
  if (_streamBuffer.length > 0) {
    set({
      streamingContent:
        (useChatStore.getState().streamingContent ?? "") + _streamBuffer,
    });
    _streamBuffer = "";
  }
  _streamFlushTimer = null;
}

function appendStreamToken(
  token: string,
  set: (partial: Partial<ChatStore>) => void,
) {
  _streamBuffer += token;
  if (!_streamFlushTimer) {
    _streamFlushTimer = setTimeout(
      () => flushStreamBuffer(set),
      STREAM_THROTTLE_MS,
    );
  }
}

function makeId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapHistoryRole(role: string): ChatMessage["role"] {
  if (role === "assistant" || role === "system" || role === "user") {return role;}
  return "assistant";
}

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length > MAX_STORED) {
    return messages.slice(messages.length - MAX_STORED);
  }
  return messages;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingMessageId: null,
  streamingContent: "",
  gatewayConnected: false,
  onboardingComplete: false,
  teamConfig: null,
  conversationId: null,
  isThinking: false,
  thinkingElapsedMs: 0,
  thinkingMessageId: null,

  cancelChat: async () => {
    try {
      await kanbanApi.cancelChat();
      set({ isThinking: false, thinkingElapsedMs: 0, thinkingMessageId: null });
    } catch {
      // Cancel is best-effort
    }
  },

  sendMessage: async (text, _asTask = false) => {
    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: trimMessages([...state.messages, userMessage]),
    }));
    get()._saveToStorage();

    try {
      const { conversationId } = await kanbanApi.sendChatMessage(
        text,
        get().conversationId ?? undefined,
      );

      // Persist conversation id immediately (SSE may be unavailable).
      set({ conversationId });

      // SSE is preferred, but fall back to short polling when SSE is broken
      // (e.g. proxy returns HTML/MIME mismatch instead of text/event-stream).
      const startedAt = Date.now();
      const timeoutMs = 30_000;
      const pollEveryMs = 1_500;
      const seen = new Set(get().messages.map((m) => m.id));

      const poll = async (): Promise<void> => {
        if (Date.now() - startedAt > timeoutMs) {return;}
        try {
          const history = await kanbanApi.getChatHistory({ conversationId, limit: 30 });
          const incoming = (history.messages ?? [])
            .filter((m) => !seen.has(m.id))
            // In fallback mode, user messages are already optimistically rendered
            // with local IDs. Server-side user echoes would otherwise appear duplicated.
            .filter((m) => m.role !== "user")
            .map((m) => ({
              id: m.id,
              role: mapHistoryRole(m.role),
              content: m.content,
              timestamp: m.timestamp ?? Date.now(),
            } satisfies ChatMessage));

          if (incoming.length > 0) {
            incoming.forEach((m) => seen.add(m.id));
            set((state) => ({ messages: trimMessages([...state.messages, ...incoming]) }));
            get()._saveToStorage();

            const hasAssistantReply = incoming.some((m) => m.role === "assistant" || m.role === "system");
            if (hasAssistantReply) {return;}
          }
        } catch {
          // Keep retrying until timeout.
        }
        setTimeout(() => {
          void poll();
        }, pollEveryMs);
      };

      void poll();
    } catch {
      // If the API call fails, add a system error message
      const errorMessage: ChatMessage = {
        id: makeId(),
        role: "system",
        content: "Failed to send message. Please check your connection.",
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: trimMessages([...state.messages, errorMessage]),
      }));
      get()._saveToStorage();
    }
  },

  confirmTask: async (_messageId, taskId) => {
    try {
      await kanbanApi.confirmExecution(taskId);
    } catch {
      const errorMessage: ChatMessage = {
        id: makeId(),
        role: "system",
        content: "Failed to confirm task. Please try again.",
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: trimMessages([...state.messages, errorMessage]),
      }));
      get()._saveToStorage();
    }
  },

  cancelTask: async (_messageId, taskId) => {
    try {
      await kanbanApi.cancelTask(taskId);
    } catch {
      const errorMessage: ChatMessage = {
        id: makeId(),
        role: "system",
        content: "Failed to cancel task. Please try again.",
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: trimMessages([...state.messages, errorMessage]),
      }));
      get()._saveToStorage();
    }
  },

  clarifyIntent: (messageId, choice) => {
    const reply: ChatMessage = {
      id: makeId(),
      role: "user",
      content: choice === "task" ? "[Run as task]" : "[Just chatting]",
      timestamp: Date.now(),
    };
    set((state) => ({
      messages: trimMessages([...state.messages, reply]),
    }));
    get()._saveToStorage();

    // Re-send via API with the clarified intent
    const original = get().messages.find((m) => m.id === messageId);
    if (original) {
      void get().sendMessage(original.content, choice === "task");
    }
  },

  acceptTeamMember: (role) => {
    const reply: ChatMessage = {
      id: makeId(),
      role: "user",
      content: `[Added team member: ${role}]`,
      timestamp: Date.now(),
    };
    set((state) => ({
      messages: trimMessages([...state.messages, reply]),
    }));
    get()._saveToStorage();
  },

  loadHistory: async (_before) => {
    // History is loaded from localStorage for now.
    // When the backend supports paginated history, this will call the API.
    get()._loadFromStorage();
  },

  clearHistory: () => {
    set({ messages: [], conversationId: null });
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  setGatewayConnected: (connected) => {
    set({ gatewayConnected: connected });
  },

  handleChatSSEEvent: (event) => {
    const ev = event as ChatSSEEvent;

    switch (ev.type) {
      case "chat_message": {
        // Backend sends: { type: "chat_message"; messageId: string; role: "assistant"; content: string; done: boolean }
        const completedMessage: ChatMessage = {
          id: ev.messageId,
          role: ev.role,
          content: ev.content,
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: trimMessages([...state.messages, completedMessage]),
          isStreaming: false,
          streamingMessageId: null,
          streamingContent: "",
          isThinking: false,
          thinkingElapsedMs: 0,
          thinkingMessageId: null,
          conversationId: state.conversationId ?? ev.messageId.split("_")[0] ?? null,
        }));
        get()._saveToStorage();
        break;
      }

      case "chat_stream_token": {
        if (!get().isStreaming) {
          // First token — start streaming mode
          set({
            isStreaming: true,
            streamingMessageId: ev.messageId,
            streamingContent: "",
          });
        }
        appendStreamToken(ev.token, set);
        break;
      }

      case "chat_task_dispatched": {
        const taskMessage: ChatMessage = {
          id: ev.messageId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          taskDispatch: { taskId: ev.taskId, title: ev.title },
        };
        set((state) => ({
          messages: trimMessages([...state.messages, taskMessage]),
        }));
        get()._saveToStorage();
        break;
      }

      case "chat_intent_clarify": {
        const clarifyMessage: ChatMessage = {
          id: ev.messageId,
          role: "assistant",
          content: ev.question,
          timestamp: Date.now(),
          intentClarify: { question: ev.question, options: ev.options },
        };
        set((state) => ({
          messages: trimMessages([...state.messages, clarifyMessage]),
        }));
        get()._saveToStorage();
        break;
      }

      case "chat_team_suggest": {
        const suggestMessage: ChatMessage = {
          id: ev.messageId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          teamSuggest: { role: ev.role, description: ev.description },
        };
        set((state) => ({
          messages: trimMessages([...state.messages, suggestMessage]),
        }));
        get()._saveToStorage();
        break;
      }

      case "chat_thinking": {
        set({
          isThinking: true,
          thinkingElapsedMs: ev.elapsed_ms ?? 0,
          thinkingMessageId: ev.messageId ?? null,
        });
        break;
      }
    }
  },

  _loadFromStorage: () => {
    if (typeof localStorage === "undefined") {return;}
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) {
          set({ messages: trimMessages(parsed) });
        }
      }
    } catch {
      // Corrupted storage, ignore
    }
  },

  _saveToStorage: () => {
    if (typeof localStorage === "undefined") {return;}
    try {
      const { messages } = get();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-MAX_STORED)),
      );
    } catch {
      // Storage full or unavailable, ignore
    }
  },
}));

// Expose store on window for E2E testing
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__chatStore = useChatStore;
}
