"use client";

import { useEffect, useRef, useCallback } from "react";
import { useChatStore, MAX_RENDERED } from "@/store/chat-store";
import { GatewayStatusBanner } from "./GatewayStatusBanner";
import { ChatMessage } from "./ChatMessage";
import { ChatStream } from "./ChatStream";
import { ChatInput } from "./ChatInput";

export function ChatView() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const gatewayConnected = useChatStore((s) => s.gatewayConnected);
  const isPendingResponse = useChatStore((s) => s.isPendingResponse);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const confirmTask = useChatStore((s) => s.confirmTask);
  const cancelTask = useChatStore((s) => s.cancelTask);
  const clarifyIntent = useChatStore((s) => s.clarifyIntent);
  const acceptTeamMember = useChatStore((s) => s.acceptTeamMember);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const _loadFromStorage = useChatStore((s) => s._loadFromStorage);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load messages from localStorage on mount, then load history
  useEffect(() => {
    _loadFromStorage();
    void loadHistory();
  }, [_loadFromStorage, loadHistory]);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent]);

  const handleSend = useCallback(
    (text: string, asTask?: boolean) => {
      void sendMessage(text, asTask);
    },
    [sendMessage],
  );

  // Only render the last MAX_RENDERED messages
  const visibleMessages = messages.slice(-MAX_RENDERED);
  const hasEarlier = messages.length > MAX_RENDERED;

  return (
    <div className="flex h-full flex-col">
      <GatewayStatusBanner connected={gatewayConnected} />

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {hasEarlier && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => loadHistory()}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)]"
            >
              Load earlier messages
            </button>
          </div>
        )}

        {visibleMessages.length === 0 && !isStreaming && (
          <div className="flex h-full items-center justify-center px-4">
            <div className="text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                No messages yet. Start a conversation or dispatch a task.
              </p>
            </div>
          </div>
        )}

        {visibleMessages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onConfirmTask={confirmTask}
            onCancelTask={cancelTask}
            onClarifyIntent={clarifyIntent}
            onAcceptTeamMember={acceptTeamMember}
          />
        ))}

        {(isStreaming || isPendingResponse) && <ChatStream content={streamingContent} />}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <ChatInput
        onSend={handleSend}
        disabled={!gatewayConnected}
        isStreaming={isStreaming}
      />
    </div>
  );
}
