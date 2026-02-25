import { describe, expect, it } from "vitest";
import { getMissionControlFeatures } from "../../apps/vwp-board/src/lib/features";

describe("mission control feature flags", () => {
  it("returns expected defaults", () => {
    expect(getMissionControlFeatures(undefined)).toEqual({
      statusPanel: true,
      kanbanV2: true,
      northStar: false,
      secondBrain: false,
      approvalsTerminal: false,
      scratchpad: false,
      telemetry: false,
      calendar: false,
    });
  });

  it("enables and disables flags via env token list", () => {
    expect(getMissionControlFeatures("northStar,telemetry,-kanbanV2")).toMatchObject({
      northStar: true,
      telemetry: true,
      kanbanV2: false,
      statusPanel: true,
    });
  });
});
