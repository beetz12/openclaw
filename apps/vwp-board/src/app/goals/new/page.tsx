"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { GoalInputForm } from "@/components/forms/GoalInputForm";
import { useBoardStore } from "@/store/board-store";

export default function NewGoalPage() {
  const router = useRouter();
  const submitGoal = useBoardStore((s) => s.submitGoal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (text: string) => {
      setLoading(true);
      setError(null);
      try {
        const id = await submitGoal(text);
        router.push(`/board/${id}`);
      } catch (err) {
        const msg =
          err && typeof err === "object" && "error" in err
            ? (err as { error: string }).error
            : "Failed to submit goal";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [submitGoal, router],
  );

  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-full max-w-2xl px-4">
        <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
          New Goal
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Describe what you want to accomplish. The system will analyze it,
          decompose it into subtasks, and assign agents.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <GoalInputForm onSubmit={handleSubmit} loading={loading} />
      </div>
    </div>
  );
}
