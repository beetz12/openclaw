"use client";

import { useEffect, useMemo, useState } from "react";
import { kanbanApi } from "@/lib/api-client";

type SearchItem = { id: string; label: string; href: string; type: "task" | "doc" };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {setOpen(false);}
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {return;}
    const load = async () => {
      const [board, docsRes] = await Promise.all([
        kanbanApi.getBoard(),
        fetch("/api/docs/list").then((r) => r.json()).catch(() => ({ files: [] })),
      ]);
      const tasks = [...board.columns.backlog, ...board.columns.todo, ...board.columns.in_progress, ...board.columns.review, ...board.columns.done]
        .slice(0, 100)
        .map((t) => ({ id: t.id, label: t.text || t.id, href: `/board/${t.id}`, type: "task" as const }));
      const docs = (docsRes.files || []).map((f: { path: string; name: string }) => ({
        id: f.path,
        label: f.name,
        href: `/docs?path=${encodeURIComponent(f.path)}`,
        type: "doc" as const,
      }));
      setItems([...tasks, ...docs]);
    };
    void load();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {return items.slice(0, 12);}
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)).slice(0, 12);
  }, [items, query]);

  if (!open) {return null;}

  return (
    <div className="fixed inset-0 z-[100] bg-black/30 p-4" onClick={() => setOpen(false)}>
      <div className="mx-auto mt-16 w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs and tasks..."
          className="w-full border-b border-[var(--color-border)] px-4 py-3 text-sm outline-none"
        />
        <div className="max-h-[420px] overflow-y-auto p-2">
          {filtered.map((item) => (
            <a key={`${item.type}:${item.id}`} href={item.href} className="block rounded px-3 py-2 text-sm hover:bg-[var(--color-bg-subtle)]">
              <span className="mr-2 text-[10px] uppercase text-[var(--color-text-muted)]">{item.type}</span>
              {item.label}
            </a>
          ))}
          {filtered.length === 0 && <div className="px-3 py-4 text-sm text-[var(--color-text-muted)]">No results</div>}
        </div>
      </div>
    </div>
  );
}
