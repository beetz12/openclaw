import { describe, expect, it } from "vitest";
import { getNorthStarMission, getNorthStarSource } from "../../apps/vwp-board/src/lib/north-star";

describe("north star mission config", () => {
  it("uses fallback mission when env is absent", () => {
    expect(getNorthStarSource(undefined)).toBe("fallback");
    expect(getNorthStarMission(undefined)).toContain("Ship meaningful outcomes daily");
  });

  it("uses env mission when provided", () => {
    const envMission = "Build Mission Control as our single operating system.";
    expect(getNorthStarSource(envMission)).toBe("env");
    expect(getNorthStarMission(envMission)).toBe(envMission);
  });
});
