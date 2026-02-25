"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [confirmAction, setConfirmAction] = useState<"reset-onboarding" | "clear-chat" | null>(null);

  const handleResetOnboarding = async () => {
    localStorage.removeItem("vwp-board-onboarding-complete");
    localStorage.removeItem("vwp-board-profile");
    localStorage.removeItem("vwp-board-onboarding-state");
    setConfirmAction(null);
    router.push("/onboarding");
  };

  const cardClass =
    "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6";

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Settings</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Virtual Workforce</h2>
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--color-text)]">Manage workforce team</div>
              <div className="text-xs text-[var(--color-text-secondary)]">Edit employee roles, skills, and activation status.</div>
            </div>
            <a
              href="/workforce"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
            >
              Open Workforce
            </a>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Autonomous Activity Feed</h2>
        <div className={`${cardClass} space-y-4`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--color-text)]">Open Activity Timeline</div>
              <div className="text-xs text-[var(--color-text-secondary)]">View heartbeat updates, filters, and digest cards</div>
            </div>
            <a
              href="/activity"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
            >
              Open
            </a>
          </div>

          <div className="border-t border-[var(--color-border)]" />

          <div>
            <div className="text-sm font-medium text-[var(--color-text)]">High-impact Telegram alerts</div>
            <div className="text-xs text-[var(--color-text-secondary)] mt-1">
              Configure gateway env vars to mirror blocked/failed/error/critical events to Telegram:
            </div>
            <pre className="mt-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] p-2 text-[11px] overflow-x-auto text-[var(--color-text-secondary)]">
OPENCLAW_VWP_TELEGRAM_BOT_TOKEN=...{"\n"}OPENCLAW_VWP_TELEGRAM_CHAT_ID=...
            </pre>
            <div className="text-xs text-[var(--color-text-secondary)] mt-2">Restart VWP stack after updating env vars.</div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Actions</h2>
        <div className={`${cardClass} space-y-4`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--color-text)]">Reset Onboarding</div>
              <div className="text-xs text-[var(--color-text-secondary)]">Clear business setup and start fresh</div>
            </div>
            {confirmAction === "reset-onboarding" ? (
              <div className="flex gap-2">
                <button
                  onClick={handleResetOnboarding}
                  className="rounded-[var(--radius-sm)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                >
                  Confirm Reset
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmAction("reset-onboarding")}
                className="rounded-[var(--radius-sm)] border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          <div className="border-t border-[var(--color-border)]" />

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--color-text)]">Clear Chat History</div>
              <div className="text-xs text-[var(--color-text-secondary)]">Remove all chat messages</div>
            </div>
            {confirmAction === "clear-chat" ? (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    localStorage.removeItem("vwp-chat-messages");
                    localStorage.removeItem("vwp-chat-conversationId");
                    setConfirmAction(null);
                  }}
                  className="rounded-[var(--radius-sm)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                >
                  Confirm Clear
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmAction("clear-chat")}
                className="rounded-[var(--radius-sm)] border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
