"use client";

import type { ChatMessage as ChatMessageType } from "@/types/chat";
import { TaskDispatchCard } from "./TaskDispatchCard";
import { IntentClarifyCard } from "./IntentClarifyCard";
import { TeamSuggestCard } from "./TeamSuggestCard";

interface ChatMessageProps {
  message: ChatMessageType;
  onConfirmTask: (messageId: string, taskId: string) => void;
  onCancelTask: (messageId: string, taskId: string) => void;
  onClarifyIntent: (messageId: string, choice: "chat" | "task") => void;
  onAcceptTeamMember: (role: string) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatMessage({
  message,
  onConfirmTask,
  onCancelTask,
  onClarifyIntent,
  onAcceptTeamMember,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-1">
        <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex px-4 py-1 ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[85%] md:max-w-[70%]`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-[var(--color-primary)] text-white"
              : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
          }`}
        >
          {message.content && (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          )}

          {message.taskDispatch && (
            <TaskDispatchCard
              messageId={message.id}
              taskId={message.taskDispatch.taskId}
              title={message.taskDispatch.title}
              onConfirm={onConfirmTask}
              onCancel={onCancelTask}
            />
          )}

          {message.intentClarify && (
            <IntentClarifyCard
              messageId={message.id}
              question={message.intentClarify.question}
              onClarify={onClarifyIntent}
            />
          )}

          {message.teamSuggest && (
            <TeamSuggestCard
              role={message.teamSuggest.role}
              description={message.teamSuggest.description}
              onAccept={onAcceptTeamMember}
              onSkip={() => {
                /* dismiss by doing nothing */
              }}
            />
          )}
        </div>

        <p
          className={`mt-0.5 text-xs text-[var(--color-text-secondary)] ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
