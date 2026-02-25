"use client";

import { useEffect, useMemo, useState } from "react";
import { kanbanApi } from "@/lib/api-client";

type AgentState = "idle" | "thinking" | "working";

export type AgentStatusSnapshot = {
  state: AgentState;
  activeTask: { id: string; text: string } | null;
  subAgentsActive: number;
  updatedAt: number;
};

export function useAgentStatus(intervalMs = 12000) {
  const [snapshot, setSnapshot] = useState<AgentStatusSnapshot>({
    state: "idle",
    activeTask: null,
    subAgentsActive: 0,
    updatedAt: Date.now(),
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const [queue, board] = await Promise.all([
        kanbanApi.getQueueState(),
        kanbanApi.getBoard(),
      ]);
      if (!mounted) {return;}

      const inProgress = board.columns.in_progress ?? [];
      const review = board.columns.review ?? [];
      const todo = board.columns.todo ?? [];

      const activeTask = queue.active ?? (inProgress[0] ? { id: inProgress[0].id, text: inProgress[0].text } : null);
      const subAgentsActive = inProgress.length;

      const state: AgentState =
        activeTask || subAgentsActive > 0
          ? "working"
          : review.length > 0 || todo.length > 0 || queue.length > 0
            ? "thinking"
            : "idle";

      setSnapshot({ state, activeTask, subAgentsActive, updatedAt: Date.now() });
    };

    void load();
    const id = setInterval(() => void load(), intervalMs);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  const stateColor = useMemo(() => {
    if (snapshot.state === "working") {return "bg-emerald-500";}
    if (snapshot.state === "thinking") {return "bg-amber-500";}
    return "bg-slate-400";
  }, [snapshot.state]);

  return { snapshot, stateColor };
}
