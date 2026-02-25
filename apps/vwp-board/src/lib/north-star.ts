const DEFAULT_MISSION = "Ship meaningful outcomes daily with full transparency and alignment.";

export function getNorthStarMission(raw = process.env.NEXT_PUBLIC_MISSION_STATEMENT): string {
  const val = (raw ?? "").trim();
  return val.length > 0 ? val : DEFAULT_MISSION;
}

export function getNorthStarSource(raw = process.env.NEXT_PUBLIC_MISSION_STATEMENT): "env" | "fallback" {
  return (raw ?? "").trim().length > 0 ? "env" : "fallback";
}
