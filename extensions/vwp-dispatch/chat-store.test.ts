import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ChatMessage } from "./kanban-types.js";
import { ServerChatStore } from "./chat-store.js";

const FIXTURE_DIR = join(import.meta.dirname!, ".test-chat-store-fixtures");

describe("ServerChatStore", () => {
  let store: ServerChatStore;

  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
    store = new ServerChatStore(FIXTURE_DIR);
  });

  afterEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });

  function makeMsg(overrides?: Partial<ChatMessage>): ChatMessage {
    return {
      id: randomUUID(),
      role: "user",
      content: "Hello",
      timestamp: Date.now(),
      ...overrides,
    };
  }

  describe("appendMessage", () => {
    it("creates directory and file for new conversation", async () => {
      const convId = "conv-1";
      const msg = makeMsg();
      await store.appendMessage(convId, msg);

      const history = await store.getHistory(convId, { limit: 10 });
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(msg);
    });

    it("appends multiple messages to same conversation", async () => {
      const convId = "conv-2";
      const msg1 = makeMsg({ content: "First" });
      const msg2 = makeMsg({ role: "assistant", content: "Second" });
      const msg3 = makeMsg({ content: "Third" });

      await store.appendMessage(convId, msg1);
      await store.appendMessage(convId, msg2);
      await store.appendMessage(convId, msg3);

      const history = await store.getHistory(convId, { limit: 10 });
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe("First");
      expect(history[1].content).toBe("Second");
      expect(history[2].content).toBe("Third");
    });

    it("keeps separate conversations isolated", async () => {
      await store.appendMessage("conv-a", makeMsg({ content: "A1" }));
      await store.appendMessage("conv-b", makeMsg({ content: "B1" }));
      await store.appendMessage("conv-a", makeMsg({ content: "A2" }));

      const historyA = await store.getHistory("conv-a", { limit: 10 });
      const historyB = await store.getHistory("conv-b", { limit: 10 });

      expect(historyA).toHaveLength(2);
      expect(historyB).toHaveLength(1);
    });
  });

  describe("getHistory", () => {
    it("returns empty array for non-existent conversation", async () => {
      const history = await store.getHistory("nonexistent", { limit: 10 });
      expect(history).toEqual([]);
    });

    it("applies limit — returns most recent messages", async () => {
      const convId = "conv-limit";
      for (let i = 0; i < 5; i++) {
        await store.appendMessage(convId, makeMsg({ content: `msg-${i}` }));
      }

      const history = await store.getHistory(convId, { limit: 3 });
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe("msg-2");
      expect(history[1].content).toBe("msg-3");
      expect(history[2].content).toBe("msg-4");
    });

    it("applies before cursor", async () => {
      const convId = "conv-cursor";
      const ids = ["id-1", "id-2", "id-3", "id-4"];

      for (const id of ids) {
        await store.appendMessage(convId, makeMsg({ id, content: `content-${id}` }));
      }

      const history = await store.getHistory(convId, { limit: 10, before: "id-3" });
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe("id-1");
      expect(history[1].id).toBe("id-2");
    });

    it("applies before cursor and limit together", async () => {
      const convId = "conv-both";
      const ids = ["id-1", "id-2", "id-3", "id-4", "id-5"];

      for (const id of ids) {
        await store.appendMessage(convId, makeMsg({ id, content: `content-${id}` }));
      }

      // Before id-5 gives [id-1, id-2, id-3, id-4], then limit 2 gives last 2
      const history = await store.getHistory(convId, { limit: 2, before: "id-5" });
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe("id-3");
      expect(history[1].id).toBe("id-4");
    });

    it("returns all messages if before cursor not found", async () => {
      const convId = "conv-no-cursor";
      await store.appendMessage(convId, makeMsg({ id: "id-1" }));
      await store.appendMessage(convId, makeMsg({ id: "id-2" }));

      const history = await store.getHistory(convId, { limit: 10, before: "nonexistent" });
      expect(history).toHaveLength(2);
    });

    it("handles limit larger than total messages", async () => {
      const convId = "conv-big-limit";
      await store.appendMessage(convId, makeMsg());
      await store.appendMessage(convId, makeMsg());

      const history = await store.getHistory(convId, { limit: 100 });
      expect(history).toHaveLength(2);
    });
  });
});
