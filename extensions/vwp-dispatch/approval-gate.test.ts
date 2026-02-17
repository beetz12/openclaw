import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const FIXTURE_DIR = join(import.meta.dirname!, ".test-fixtures", "approval");
const TASKS_BASE = join(FIXTURE_DIR, ".openclaw", "vwp", "tasks");

vi.mock("node:os", () => ({
  homedir: () => FIXTURE_DIR,
}));

const { ApprovalGate } = await import("./approval-gate.ts");

describe("ApprovalGate", () => {
  const taskId = "approval-test-001";
  const pendingDir = join(TASKS_BASE, taskId, "pending-actions");

  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });

  describe("requestApproval", () => {
    it("writes a pending action file", async () => {
      const gate = new ApprovalGate(taskId);

      // Start the request but handle the approval quickly.
      const approvalPromise = gate.requestApproval(
        "subtask-1",
        "api_call",
        "Call external API",
        1000,
      );

      // Wait for the file to be written, then approve it.
      await sleep(100);
      const files = await readdir(pendingDir);
      const actionFile = files.find((f) => f.endsWith(".json") && !f.includes("-response"));
      expect(actionFile).toBeDefined();

      // Read the action file to verify contents.
      const raw = await readFile(join(pendingDir, actionFile!), "utf-8");
      const action = JSON.parse(raw);
      expect(action.subtaskId).toBe("subtask-1");
      expect(action.actionType).toBe("api_call");
      expect(action.detail).toBe("Call external API");
      expect(action.status).toBe("pending");

      // Approve it by writing the response file.
      const responseFile = actionFile!.replace(/\.json$/, "-response.json");
      await writeFile(
        join(pendingDir, responseFile),
        JSON.stringify({ actionId: action.actionId, approved: true, respondedAt: Date.now() }),
      );

      const result = await approvalPromise;
      expect(result).toBe(true);
    });

    it("returns false when rejected", async () => {
      const gate = new ApprovalGate(taskId);

      const approvalPromise = gate.requestApproval("subtask-2", "delete", "Delete records", 1000);

      await sleep(100);
      const files = await readdir(pendingDir);
      const actionFile = files.find((f) => f.endsWith(".json") && !f.includes("-response"));

      const responseFile = actionFile!.replace(/\.json$/, "-response.json");
      await writeFile(
        join(pendingDir, responseFile),
        JSON.stringify({ actionId: "test", approved: false, respondedAt: Date.now() }),
      );

      const result = await approvalPromise;
      expect(result).toBe(false);
    });

    it("returns false on timeout", async () => {
      const gate = new ApprovalGate(taskId);

      // Use a very short timeout.
      const result = await gate.requestApproval("subtask-3", "test", "test detail", 500);
      expect(result).toBe(false);
    });

    it("emits SSE event when sse is provided", async () => {
      const emitted: unknown[] = [];
      const mockSSE = {
        emit: (event: unknown) => emitted.push(event),
      } as any;

      const gate = new ApprovalGate(taskId, mockSSE);

      // Start approval (will timeout quickly).
      void gate.requestApproval("subtask-4", "api_call", "Call API", 500);

      // SSE event should be emitted immediately.
      await sleep(50);
      expect(emitted).toHaveLength(1);
      const event = emitted[0] as any;
      expect(event.type).toBe("approval_required");
      expect(event.taskId).toBe(taskId);
      expect(event.subtaskId).toBe("subtask-4");
      expect(event.actionType).toBe("api_call");
    });
  });

  describe("handleApproval", () => {
    it("writes a response file", async () => {
      const gate = new ApprovalGate(taskId);

      await gate.handleApproval("action-123", true, "Looks good");

      const responsePath = join(pendingDir, "action-123-response.json");
      const raw = await readFile(responsePath, "utf-8");
      const response = JSON.parse(raw);

      expect(response.actionId).toBe("action-123");
      expect(response.approved).toBe(true);
      expect(response.reason).toBe("Looks good");
      expect(response.respondedAt).toBeGreaterThan(0);
    });

    it("writes rejection response", async () => {
      const gate = new ApprovalGate(taskId);

      await gate.handleApproval("action-456", false, "Too risky");

      const responsePath = join(pendingDir, "action-456-response.json");
      const raw = await readFile(responsePath, "utf-8");
      const response = JSON.parse(raw);

      expect(response.approved).toBe(false);
      expect(response.reason).toBe("Too risky");
    });
  });

  describe("getPending", () => {
    it("returns empty array when no pending actions", async () => {
      const gate = new ApprovalGate(taskId);
      const pending = await gate.getPending();
      expect(pending).toEqual([]);
    });

    it("returns pending actions without responses", async () => {
      const gate = new ApprovalGate(taskId);

      // Create pending actions directory and files.
      await mkdir(pendingDir, { recursive: true });
      await writeFile(
        join(pendingDir, "action-1.json"),
        JSON.stringify({
          actionId: "action-1",
          subtaskId: "sub-1",
          actionType: "api_call",
          detail: "test",
          createdAt: Date.now(),
          status: "pending",
        }),
      );
      await writeFile(
        join(pendingDir, "action-2.json"),
        JSON.stringify({
          actionId: "action-2",
          subtaskId: "sub-2",
          actionType: "delete",
          detail: "test 2",
          createdAt: Date.now(),
          status: "pending",
        }),
      );

      // Add response for action-2 (so it should be excluded).
      await writeFile(
        join(pendingDir, "action-2-response.json"),
        JSON.stringify({ actionId: "action-2", approved: true, respondedAt: Date.now() }),
      );

      const pending = await gate.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.actionId).toBe("action-1");
    });

    it("returns empty array when all actions have responses", async () => {
      const gate = new ApprovalGate(taskId);

      await mkdir(pendingDir, { recursive: true });
      await writeFile(
        join(pendingDir, "action-1.json"),
        JSON.stringify({
          actionId: "action-1",
          subtaskId: "sub-1",
          actionType: "test",
          detail: "test",
          createdAt: Date.now(),
          status: "pending",
        }),
      );
      await writeFile(
        join(pendingDir, "action-1-response.json"),
        JSON.stringify({ actionId: "action-1", approved: true, respondedAt: Date.now() }),
      );

      const pending = await gate.getPending();
      expect(pending).toEqual([]);
    });
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
