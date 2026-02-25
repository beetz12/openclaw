"use client";

import { useEffect, useState } from "react";
import { kanbanApi } from "@/lib/api-client";

type ApprovalItem = { id: string; to: string; content: string; channel: string; status: string; created_at: number };

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const load = async () => {
    try {
      setError(null);
      const data = await Promise.race([
        kanbanApi.getPendingApprovals(100, 0),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Approvals request timed out")), 12000);
        }),
      ]);
      setItems(data.items ?? []);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, []);

  if (loading) {return <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading approvals…</div>;}
  if (error) {
    return (
      <div className="p-4 space-y-3">
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Failed to load approvals: {error}
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="rounded border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium"
        >
          Retry load
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">Approvals Terminal</h2>
            <p className="text-xs text-[var(--color-text-muted)]">Approve or reject outbound items before delivery.</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Auto-refresh every 15s • {items.length} pending</p>
          </div>
          {lastUpdatedAt && (
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Updated {new Date(lastUpdatedAt).toLocaleTimeString()} ({Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000))}s ago)
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {items.length > 0 && (
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
            Showing {items.length} pending approval{items.length === 1 ? "" : "s"}.
          </div>
        )}
        {items.length === 0 ? (
          <div className="rounded border border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-text-muted)]">
            No pending approvals.
          </div>
        ) : (
          items.map((item, index) => {
            const preview = item.content.length > 220 ? `${item.content.slice(0, 220)}…` : item.content;
            const created = Number.isFinite(item.created_at)
              ? new Date(item.created_at).toLocaleString()
              : "unknown";
            return (
              <div key={item.id} className="rounded-xl border border-[var(--color-border)] bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)]" title={`Channel: ${item.channel} • Destination: ${item.to}`}>{item.channel} → {item.to}</p>
                    <p className="text-sm font-medium text-[var(--color-text)] break-words" title={item.content}>{preview}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5" title={`Position in queue: ${index + 1}`}>
                        queue: #{index + 1}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5" title={item.id}>id: {item.id.slice(0, 8)}…</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5" title={`Characters in content: ${item.content.length}`}>chars: {item.content.length}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5" title={`Created at ${created}`}>created: {created}</span>
                    </div>
                  </div>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700" title="Awaiting explicit approve/reject decision">
                    pending
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await kanbanApi.approvePendingMessage(item.id);
                      await load();
                    }}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await kanbanApi.rejectPendingMessage(item.id, "Rejected from dashboard");
                      await load();
                    }}
                    className="rounded border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
