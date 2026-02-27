"use client";

import { useEffect, useMemo, useState } from "react";

type ContentIdea = {
  id: string;
  title: string;
  status: string;
  priority_rank: number | null;
  score_total: number | null;
  source_run_id: string;
  created_at: string;
  rationale_summary: string | null;
  recommended_next_action: string | null;
};

type ContentRun = {
  id: string;
  created_at: string;
  completed_at: string | null;
  trigger_type: "heartbeat" | "cron" | "manual";
  status: string;
  objective: string | null;
  result_summary: string | null;
};

type ContentPacket = {
  id: string;
  source_run_id: string;
  created_at: string;
  packet_type: string;
  title: string;
  summary: string | null;
  recommendations: string | null;
  evidence: string | null;
  decision_rationale: string | null;
  debug_notes: string | null;
  next_action: string | null;
};

type ContentAction = {
  id: string;
  created_at: string;
  idea_id: string;
  actor: string;
  action_type: string;
  note: string | null;
};

function tryParseJson(raw: string | null): unknown {
  if (!raw) {return null;}
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function pretty(value: unknown): string {
  if (value == null) {return "—";}
  if (typeof value === "string") {return value;}
  return JSON.stringify(value, null, 2);
}

export default function ContentPage() {
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [runs, setRuns] = useState<ContentRun[]>([]);
  const [packets, setPackets] = useState<ContentPacket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ideas" | "deliverables" | "runs" | "tools">("ideas");
  const [actions, setActions] = useState<ContentAction[]>([]);
  const [approveNote, setApproveNote] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [ideasRes, runsRes, packetsRes] = await Promise.all([
        fetch("/api/content/ideas?limit=100", { cache: "no-store" }),
        fetch("/api/content/runs?limit=50", { cache: "no-store" }),
        fetch("/api/content/packets?limit=100", { cache: "no-store" }),
      ]);

      if (!ideasRes.ok || !runsRes.ok || !packetsRes.ok) {
        throw new Error(`load_failed ideas=${ideasRes.status} runs=${runsRes.status} packets=${packetsRes.status}`);
      }

      const ideasData = (await ideasRes.json()) as { items: ContentIdea[] };
      const runsData = (await runsRes.json()) as { items: ContentRun[] };
      const packetsData = (await packetsRes.json()) as { items: ContentPacket[] };

      setIdeas(ideasData.items ?? []);
      setRuns(runsData.items ?? []);
      setPackets(packetsData.items ?? []);

      if (!selectedIdeaId && (ideasData.items?.length ?? 0) > 0) {
        setSelectedIdeaId(ideasData.items[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content data");
    } finally {
      setLoading(false);
    }
  };

  const loadActions = async (ideaId: string) => {
    try {
      const res = await fetch(`/api/content/actions?idea_id=${encodeURIComponent(ideaId)}&limit=50`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`actions_load_failed_${res.status}`);
      }
      const data = (await res.json()) as { items: ContentAction[] };
      setActions(data.items ?? []);
    } catch (err) {
      setActions([]);
      setError(err instanceof Error ? err.message : "Failed to load actions");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedIdeaId) {
      setActions([]);
      return;
    }
    setSelectedPacketId(null);
    void loadActions(selectedIdeaId);
  }, [selectedIdeaId]);

  const selectedIdea = useMemo(
    () => ideas.find((idea) => idea.id === selectedIdeaId) ?? ideas[0] ?? null,
    [ideas, selectedIdeaId],
  );

  const packetsForSelectedRun = useMemo(() => {
    if (!selectedIdea) {return [] as ContentPacket[];}
    return packets
      .filter((packet) => packet.source_run_id === selectedIdea.source_run_id)
      .toSorted((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [packets, selectedIdea]);

  useEffect(() => {
    if (!packetsForSelectedRun.length) {
      setSelectedPacketId(null);
      return;
    }
    if (!selectedPacketId || !packetsForSelectedRun.some((p) => p.id === selectedPacketId)) {
      setSelectedPacketId(packetsForSelectedRun[0]?.id ?? null);
    }
  }, [packetsForSelectedRun, selectedPacketId]);

  const selectedPacket = useMemo(() => {
    if (!selectedIdea) {return null;}
    if (!packetsForSelectedRun.length) {return null;}
    if (selectedPacketId) {
      return packetsForSelectedRun.find((p) => p.id === selectedPacketId) ?? packetsForSelectedRun[0] ?? null;
    }
    return packetsForSelectedRun[0] ?? null;
  }, [packetsForSelectedRun, selectedIdea, selectedPacketId]);

  const runsById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);

  const deliverables = useMemo(() => {
    return packets
      .map((packet) => ({
        packet,
        run: runsById.get(packet.source_run_id) ?? null,
        relatedIdeas: ideas.filter((idea) => idea.source_run_id === packet.source_run_id),
      }))
      .toSorted((a, b) => new Date(b.packet.created_at).getTime() - new Date(a.packet.created_at).getTime());
  }, [ideas, packets, runsById]);

  const approveIdea = async (ideaId: string) => {
    setApprovingId(ideaId);
    try {
      const res = await fetch("/api/content/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: ideaId,
          action_type: "approve",
          actor: "mission-control-ui",
          note: approveNote || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `approve_failed_${res.status}`);
      }
      setApproveNote("");
      await load();
      await loadActions(ideaId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setApprovingId(null);
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading Mission Control Content…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">Mission Control Content</h2>
            <p className="text-xs text-[var(--color-text-muted)]">Idea queue, run timeline, and packet preview with actioning.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="rounded border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="border-b border-[var(--color-border)] px-4 py-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {([
            ["ideas", `Ideas (${ideas.length})`],
            ["deliverables", `Deliverables (${packets.length})`],
            ["runs", `Runs (${runs.length})`],
            ["tools", "Tools"],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded border px-3 py-1.5 font-medium ${activeTab === tab ? "border-sky-600 bg-sky-50 text-sky-700" : "border-[var(--color-border)] bg-white text-[var(--color-text)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {activeTab === "ideas" && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 xl:grid-cols-[1.1fr_0.9fr_1.4fr]">
          <section className="min-h-0 overflow-hidden rounded border border-[var(--color-border)] bg-white">
            <div className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-semibold">Idea Queue ({ideas.length})</div>
            <div className="max-h-full overflow-auto">
              {ideas.length === 0 ? (
                <div className="p-3 text-sm text-[var(--color-text-muted)]">No ideas yet. Ingest a run or use seed helper.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">
                    <tr>
                      <th className="px-2 py-2">Idea</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Score</th>
                      <th className="px-2 py-2">Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ideas.map((idea) => (
                      <tr
                        key={idea.id}
                        onClick={() => setSelectedIdeaId(idea.id)}
                        className={`cursor-pointer border-t border-[var(--color-border)] ${selectedIdea?.id === idea.id ? "bg-sky-50" : "hover:bg-[var(--color-bg-subtle)]"}`}
                      >
                        <td className="px-2 py-2">
                          <div className="font-medium text-[var(--color-text)]">#{idea.priority_rank ?? "-"} {idea.title}</div>
                          <div className="text-[11px] text-[var(--color-text-muted)]">{new Date(idea.created_at).toLocaleString()}</div>
                        </td>
                        <td className="px-2 py-2">{idea.status}</td>
                        <td className="px-2 py-2">{idea.score_total?.toFixed?.(1) ?? "—"}</td>
                        <td className="px-2 py-2" title={idea.source_run_id}>{idea.source_run_id.slice(0, 8)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="min-h-0 overflow-hidden rounded border border-[var(--color-border)] bg-white">
            <div className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-semibold">Run Timeline ({runs.length})</div>
            <div className="max-h-full overflow-auto p-3 space-y-2">
              {runs.length === 0 ? (
                <div className="text-sm text-[var(--color-text-muted)]">No runs captured yet.</div>
              ) : (
                runs.map((run) => (
                  <div key={run.id} className="rounded border border-[var(--color-border)] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{run.trigger_type}</span>
                      <span className="text-xs">{run.status}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium">{run.objective ?? "(no objective)"}</div>
                    <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{new Date(run.created_at).toLocaleString()}</div>
                    {run.result_summary && <div className="mt-1 text-xs text-[var(--color-text-muted)]">{run.result_summary}</div>}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="min-h-0 overflow-auto rounded border border-[var(--color-border)] bg-white">
            <div className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-semibold">Packet Preview</div>
            {!selectedIdea ? (
              <div className="p-3 text-sm text-[var(--color-text-muted)]">Select an idea to preview packet details.</div>
            ) : (
              <div className="space-y-3 p-3 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Selected Idea</div>
                  <div className="font-semibold">{selectedIdea.title}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{selectedIdea.rationale_summary ?? "No rationale summary"}</div>
                </div>

                <div className="rounded border border-[var(--color-border)] p-2">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Approve</div>
                  <textarea
                    value={approveNote}
                    onChange={(e) => setApproveNote(e.target.value)}
                    placeholder="Optional approval note"
                    rows={2}
                    className="mt-1 w-full rounded border border-[var(--color-border)] px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    disabled={approvingId === selectedIdea.id || selectedIdea.status === "approved"}
                    onClick={() => void approveIdea(selectedIdea.id)}
                    className="mt-2 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedIdea.status === "approved" ? "Already approved" : approvingId === selectedIdea.id ? "Approving…" : "Approve"}
                  </button>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Action History ({actions.length})</div>
                  {actions.length === 0 ? (
                    <div className="mt-1 rounded bg-[var(--color-bg-subtle)] p-2 text-xs text-[var(--color-text-muted)]">No actions yet for this idea.</div>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {actions.map((action) => (
                        <div key={action.id} className="rounded border border-[var(--color-border)] p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold uppercase tracking-wide">{action.action_type}</span>
                            <span className="text-[11px] text-[var(--color-text-muted)]">{new Date(action.created_at).toLocaleString()}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">by {action.actor}</div>
                          {action.note && <div className="mt-1 whitespace-pre-wrap">{action.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {!selectedPacket ? (
                  <div className="text-sm text-[var(--color-text-muted)]">No packet available for selected run yet.</div>
                ) : (
                  <>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Packet</div>
                      <div className="mt-1 flex items-center gap-2">
                        <select
                          value={selectedPacketId ?? selectedPacket.id}
                          onChange={(e) => setSelectedPacketId(e.target.value)}
                          className="min-w-0 flex-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs"
                          aria-label="Select packet"
                        >
                          {packetsForSelectedRun.map((packet) => (
                            <option key={packet.id} value={packet.id}>
                              {packet.packet_type} · {new Date(packet.created_at).toLocaleString()}
                            </option>
                          ))}
                        </select>
                        <span className="text-[11px] text-[var(--color-text-muted)]">{packetsForSelectedRun.length} total</span>
                      </div>
                      <div className="mt-1 font-semibold">{selectedPacket.title}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">{selectedPacket.packet_type}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Summary</div>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-[var(--color-bg-subtle)] p-2 text-xs">{selectedPacket.summary ?? "—"}</pre>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Recommendations</div>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-[var(--color-bg-subtle)] p-2 text-xs">{pretty(tryParseJson(selectedPacket.recommendations))}</pre>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Evidence</div>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-[var(--color-bg-subtle)] p-2 text-xs">{pretty(tryParseJson(selectedPacket.evidence))}</pre>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Rationale</div>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-[var(--color-bg-subtle)] p-2 text-xs">{selectedPacket.decision_rationale ?? "—"}</pre>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Debug Notes</div>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-[var(--color-bg-subtle)] p-2 text-xs">{pretty(tryParseJson(selectedPacket.debug_notes))}</pre>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Next Action</div>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-[var(--color-bg-subtle)] p-2 text-xs">{selectedPacket.next_action ?? selectedIdea.recommended_next_action ?? "—"}</pre>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "deliverables" && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="space-y-3">
            {deliverables.length === 0 ? (
              <div className="rounded border border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-text-muted)]">No deliverables yet.</div>
            ) : (
              deliverables.map(({ packet, run, relatedIdeas }) => (
                <article key={packet.id} className="rounded border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">{packet.title}</h3>
                    <span className="rounded bg-[var(--color-bg-subtle)] px-2 py-1 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">{packet.packet_type}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">{new Date(packet.created_at).toLocaleString()} • {run?.trigger_type ?? "unknown trigger"}</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">What we are working on</div>
                      <div className="mt-1 text-sm">{run?.objective ?? "No objective captured."}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Result</div>
                      <div className="mt-1 text-sm">{packet.summary ?? run?.result_summary ?? "No summary available."}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Research / Evidence</div>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-[var(--color-bg-subtle)] p-2 text-xs">{pretty(tryParseJson(packet.evidence))}</pre>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Related Ideas</div>
                      <div className="mt-1 text-xs text-[var(--color-text-muted)]">{relatedIdeas.length ? relatedIdeas.map((idea) => idea.title).join(" • ") : "No linked ideas"}</div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "runs" && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="rounded border border-[var(--color-border)] bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{run.trigger_type}</span>
                  <span className="text-xs">{run.status}</span>
                </div>
                <div className="mt-1 text-sm font-medium">{run.objective ?? "(no objective)"}</div>
                <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{new Date(run.created_at).toLocaleString()}</div>
                {run.result_summary && <div className="mt-1 text-xs text-[var(--color-text-muted)]">{run.result_summary}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "tools" && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="rounded border border-[var(--color-border)] bg-white p-4 text-sm">
            <div className="font-semibold">Tools & Skill Flywheel</div>
            <p className="mt-2 text-[var(--color-text-muted)]">
              Tool/skill tracking is active through packets, weekly scorecard docs, and cron updates. Next step is wiring live DB scorecards into this tab.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--color-text-muted)]">
              <li>Review packets in Deliverables tab for tool usage context.</li>
              <li>Use weekly scorecard to decide keep/improve/remove.</li>
              <li>Cron now prioritizes tool/skill research and creation.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
