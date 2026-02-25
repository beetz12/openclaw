"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { DocEditorModal } from "@/components/docs/DocEditorModal";

type DocFile = { path: string; name: string };

export default function DocsPage() {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [activePath, setActivePath] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/docs/list");
      const data = await res.json();
      setFiles(data.files ?? []);
      if (data.files?.[0]?.path) {setActivePath(data.files[0].path);}
      setLoading(false);
    };
    void load();
  }, []);

  useEffect(() => {
    if (!activePath) {return;}
    const load = async () => {
      const res = await fetch(`/api/docs/read?path=${encodeURIComponent(activePath)}`);
      const data = await res.json();
      setContent(data.content ?? "");
    };
    void load();
  }, [activePath]);

  if (loading) {return <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading docs…</div>;}

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[280px_1fr]">
      <aside className="border-r border-[var(--color-border)] p-3 overflow-y-auto">
        <h2 className="text-sm font-semibold mb-2">Second Brain</h2>
        <div className="space-y-1">
          {files.map((f) => (
            <button
              key={f.path}
              onClick={() => setActivePath(f.path)}
              className={`block w-full text-left rounded px-2 py-1.5 text-sm ${activePath === f.path ? "bg-[var(--color-primary)] text-white" : "hover:bg-[var(--color-bg-subtle)]"}`}
            >
              <div className="font-medium truncate">{f.name}</div>
              <div className="text-[10px] opacity-80 truncate">{f.path}</div>
            </button>
          ))}
        </div>
      </aside>
      <main className="overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
          <span>{activePath || "No file selected"}</span>
          {activePath && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-medium text-[var(--color-text)]"
            >
              Edit
            </button>
          )}
        </div>
        <article className="prose prose-sm max-w-none">
          <ReactMarkdown>{content || "No content"}</ReactMarkdown>
        </article>
      </main>
      {editing && activePath && (
        <DocEditorModal
          path={activePath}
          content={content}
          onClose={() => setEditing(false)}
          onSaved={(next) => setContent(next)}
        />
      )}
    </div>
  );
}
