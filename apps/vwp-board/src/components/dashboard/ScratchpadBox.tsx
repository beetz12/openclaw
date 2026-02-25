"use client";

import { useState } from "react";

export function ScratchpadBox() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"execute-now" | "queue-task" | "save-memory">("save-memory");
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<string>("");

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Scratchpad</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Drop quick thoughts, links, or instructions..."
        className="mt-2 h-24 w-full rounded border border-[var(--color-border)] p-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "execute-now" | "queue-task" | "save-memory")}
          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs"
        >
          <option value="execute-now">execute-now</option>
          <option value="queue-task">queue-task</option>
          <option value="save-memory">save-memory</option>
        </select>
        <button
          type="button"
          disabled={saving || !text.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch("/api/scratchpad", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, mode }),
              });
              const data = await res.json();
              if (!res.ok) {throw new Error(data.error || "Save failed");}
              setLast(`Saved via ${data.mode} → ${data.path}`);
              setText("");
            } finally {
              setSaving(false);
            }
          }}
          className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Capture"}
        </button>
      </div>
      {last && <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">{last}</p>}
    </div>
  );
}
