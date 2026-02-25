import { getNorthStarMission, getNorthStarSource } from "@/lib/north-star";

export function NorthStarBanner() {
  const mission = getNorthStarMission();
  const source = getNorthStarSource();

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        North Star Mission
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{mission}</p>
      <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">source: {source}</p>
    </div>
  );
}
