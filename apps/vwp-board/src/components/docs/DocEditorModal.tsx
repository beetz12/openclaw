"use client";

import { useState } from "react";

export function DocEditorModal({
  path,
  content,
  onClose,
  onSaved,
}: {
  path: string;
  content: string;
  onClose: () => void;
  onSaved: (newContent: string) => void;
}) {
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Editing</p>
            <p className="text-sm font-semibold text-[var(--color-text)]">{path}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm hover:bg-[var(--color-bg-subtle)]">Close</button>
        </div>
        <div className="p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-[420px] w-full rounded border border-[var(--color-border)] p-3 font-mono text-sm"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm">Cancel</button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const res = await fetch("/api/docs/write", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path, content: draft }),
                  });
                  if (!res.ok) {throw new Error("Save failed");}
                  onSaved(draft);
                  onClose();
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
