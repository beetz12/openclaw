import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import { classifyIntent } from "./intent-classifier.js";

// Helper to create a mock GatewayClient
function createMockGateway(opts?: { connected?: boolean }) {
  const emitter = new EventEmitter();
  const gw = Object.assign(emitter, {
    isConnected: vi.fn().mockReturnValue(opts?.connected ?? true),
    call: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  });
  return gw;
}

describe("classifyIntent", () => {
  it("returns 'chat' intent when gateway responds with chat classification", async () => {
    const gateway = createMockGateway();
    gateway.call.mockImplementation(async () => {
      process.nextTick(() => {
        gateway.emit("chat", {
          state: "final",
          message: {
            content: [{ text: JSON.stringify({ intent: "chat", confidence: 0.9 }) }],
          },
        });
      });
    });

    const result = await classifyIntent("What's the weather?", gateway as any, "session-1");
    expect(result.intent).toBe("chat");
    expect(result.confidence).toBe(0.9);
    expect(result.taskTitle).toBeUndefined();
  });

  it("returns 'task' intent with taskTitle when gateway classifies as task", async () => {
    const gateway = createMockGateway();
    gateway.call.mockImplementation(async () => {
      process.nextTick(() => {
        gateway.emit("chat", {
          state: "final",
          message: {
            content: [
              {
                text: JSON.stringify({
                  intent: "task",
                  confidence: 0.95,
                  taskTitle: "Build a dashboard",
                }),
              },
            ],
          },
        });
      });
    });

    const result = await classifyIntent("Build me a dashboard", gateway as any, "session-2");
    expect(result.intent).toBe("task");
    expect(result.confidence).toBe(0.95);
    expect(result.taskTitle).toBe("Build a dashboard");
  });

  it("returns 'ambiguous' fallback when gateway is not connected", async () => {
    const gateway = createMockGateway({ connected: false });

    const result = await classifyIntent("Hello", gateway as any, "session-3");
    expect(result.intent).toBe("ambiguous");
    expect(result.confidence).toBe(0.5);
  });

  it("returns 'ambiguous' fallback when gateway returns error state", async () => {
    const gateway = createMockGateway();
    gateway.call.mockImplementation(async () => {
      process.nextTick(() => {
        gateway.emit("chat", {
          state: "error",
          message: { content: [{ text: "Something failed" }] },
        });
      });
    });

    const result = await classifyIntent("Test", gateway as any, "session-4");
    expect(result.intent).toBe("ambiguous");
    expect(result.confidence).toBe(0.5);
  });

  it("returns 'ambiguous' fallback when response is not valid JSON", async () => {
    const gateway = createMockGateway();
    gateway.call.mockImplementation(async () => {
      process.nextTick(() => {
        gateway.emit("chat", {
          state: "final",
          message: { content: [{ text: "not valid json" }] },
        });
      });
    });

    const result = await classifyIntent("Test", gateway as any, "session-5");
    expect(result.intent).toBe("ambiguous");
  });

  it("returns 'ambiguous' fallback when intent is not a valid value", async () => {
    const gateway = createMockGateway();
    gateway.call.mockImplementation(async () => {
      process.nextTick(() => {
        gateway.emit("chat", {
          state: "final",
          message: {
            content: [{ text: JSON.stringify({ intent: "unknown", confidence: 0.8 }) }],
          },
        });
      });
    });

    const result = await classifyIntent("Test", gateway as any, "session-6");
    expect(result.intent).toBe("ambiguous");
  });

  it("returns 'ambiguous' fallback when gateway.call throws", async () => {
    const gateway = createMockGateway();
    gateway.call.mockRejectedValue(new Error("RPC error"));

    const result = await classifyIntent("Test", gateway as any, "session-7");
    expect(result.intent).toBe("ambiguous");
    expect(result.confidence).toBe(0.5);
  });

  it("returns 'ambiguous' fallback on aborted state", async () => {
    const gateway = createMockGateway();
    gateway.call.mockImplementation(async () => {
      process.nextTick(() => {
        gateway.emit("chat", {
          state: "aborted",
          message: { content: [{ text: "" }] },
        });
      });
    });

    const result = await classifyIntent("Test", gateway as any, "session-8");
    expect(result.intent).toBe("ambiguous");
  });

  it("defaults confidence to 0.5 when not a number", async () => {
    const gateway = createMockGateway();
    gateway.call.mockImplementation(async () => {
      process.nextTick(() => {
        gateway.emit("chat", {
          state: "final",
          message: {
            content: [{ text: JSON.stringify({ intent: "chat", confidence: "high" }) }],
          },
        });
      });
    });

    const result = await classifyIntent("Test", gateway as any, "session-9");
    expect(result.intent).toBe("chat");
    expect(result.confidence).toBe(0.5);
  });

  it("does not set taskTitle for non-task intents", async () => {
    const gateway = createMockGateway();
    gateway.call.mockImplementation(async () => {
      process.nextTick(() => {
        gateway.emit("chat", {
          state: "final",
          message: {
            content: [
              {
                text: JSON.stringify({
                  intent: "chat",
                  confidence: 0.8,
                  taskTitle: "should be ignored",
                }),
              },
            ],
          },
        });
      });
    });

    const result = await classifyIntent("What time is it?", gateway as any, "session-10");
    expect(result.intent).toBe("chat");
    expect(result.taskTitle).toBeUndefined();
  });
});
