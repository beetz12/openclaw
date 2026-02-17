import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hasDecomposition } from "./checkpoint.js";
import { saveDecomposition } from "./checkpoint.js";

const TEST_DATA_DIR = path.join(process.cwd(), "data", "vwp-dispatch", "tasks");

describe("confirm-race: hasDecomposition guard", () => {
  let testTaskId: string;

  beforeEach(() => {
    testTaskId = randomUUID();
  });

  afterEach(async () => {
    // Cleanup test data
    try {
      const taskDir = path.join(TEST_DATA_DIR, testTaskId);
      await fs.rm(taskDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should return false when no decomposition file exists", async () => {
    const result = await hasDecomposition(testTaskId);
    expect(result).toBe(false);
  });

  it("should return true when decomposition file exists", async () => {
    // Create a decomposition
    const decomposition = {
      subtasks: [
        {
          id: "1",
          description: "Test subtask",
          reasoning: "Test reasoning",
          estimatedComplexity: "medium" as const,
        },
      ],
      estimatedComplexity: "medium" as const,
    };

    await saveDecomposition(testTaskId, decomposition);

    const result = await hasDecomposition(testTaskId);
    expect(result).toBe(true);
  });
});
