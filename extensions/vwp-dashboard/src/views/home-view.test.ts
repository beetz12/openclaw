import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Stub browser globals BEFORE the component import.
// home-view imports router.js (window.addEventListener), client.js (localStorage
// singleton), tasks-client.js (localStorage singleton), sse.js, and sub-components.
// ---------------------------------------------------------------------------

const { store } = vi.hoisted(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { origin: "http://localhost:3000", hash: "" },
  };
  (globalThis as any).fetch = () => Promise.resolve({ ok: true, json: async () => ({}) });
  return { store };
});

import { HomeView } from "./home-view.js";

// ---------------------------------------------------------------------------
// Test HomeView pure logic without triggering Lit's DOM lifecycle.
// We use Object.create to get prototype methods without constructor/connect.
// Object.defineProperty bypasses Lit's @state() reactive setters.
// ---------------------------------------------------------------------------

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

/** Set an own data property that shadows the Lit @state() prototype accessor. */
function def(obj: any, key: string, value: any) {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true });
}

function create(): HomeView {
  const el = Object.create(HomeView.prototype) as HomeView;
  def(el, "loading", false);
  def(el, "pendingCount", 0);
  def(el, "todayCount", 0);
  def(el, "approvalRate", 0);
  def(el, "_taskInput", "");
  def(el, "_submitting", false);
  def(el, "_activeTask", null);
  def(el, "channels", []);
  def(el, "recentActivity", []);
  def(el, "_unsubscribers", []);
  return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HomeView", () => {
  describe("_getUserName", () => {
    it("returns business name from localStorage", () => {
      store["vwp-user-name"] = "Test Company";
      const el = create();
      expect((el as any)._getUserName()).toBe("Test Company");
    });

    it("returns 'there' when no name set", () => {
      const el = create();
      expect((el as any)._getUserName()).toBe("there");
    });
  });

  describe("_getSuggestions", () => {
    it("returns IT consultancy suggestions", () => {
      store["vwp-business-type"] = "it-consultancy";
      const el = create();
      const suggestions = (el as any)._getSuggestions() as string[];
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]).toBe("Draft a project status update");
      expect(suggestions[1]).toBe("Summarize open support tickets");
      expect(suggestions[2]).toBe("Write a meeting follow-up email");
    });

    it("returns ecommerce suggestions", () => {
      store["vwp-business-type"] = "ecommerce";
      const el = create();
      const suggestions = (el as any)._getSuggestions() as string[];
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]).toBe("Check order status for a customer");
    });

    it("returns default suggestions for other type", () => {
      store["vwp-business-type"] = "other";
      const el = create();
      const suggestions = (el as any)._getSuggestions() as string[];
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]).toBe("Draft a reply to a customer");
    });

    it("returns default suggestions when no type set", () => {
      const el = create();
      const suggestions = (el as any)._getSuggestions() as string[];
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]).toBe("Draft a reply to a customer");
    });
  });

  describe("_formatTimeAgo", () => {
    it("returns 'just now' for recent timestamps", () => {
      const el = create();
      expect((el as any)._formatTimeAgo(Date.now())).toBe("just now");
    });

    it("returns minutes for sub-hour timestamps", () => {
      const el = create();
      expect((el as any)._formatTimeAgo(Date.now() - 5 * 60 * 1000)).toBe("5m ago");
    });

    it("returns hours for sub-day timestamps", () => {
      const el = create();
      expect((el as any)._formatTimeAgo(Date.now() - 3 * 60 * 60 * 1000)).toBe("3h ago");
    });

    it("returns days for older timestamps", () => {
      const el = create();
      expect((el as any)._formatTimeAgo(Date.now() - 2 * 24 * 60 * 60 * 1000)).toBe("2d ago");
    });
  });

  describe("statusIcon (standalone)", () => {
    it("returns check mark for approved", async () => {
      const { statusIcon, checkCircle } = await import("../styles/icons.js");
      expect(statusIcon("approved")).toBe(checkCircle);
    });

    it("returns check mark for auto_approved", async () => {
      const { statusIcon, checkCircle } = await import("../styles/icons.js");
      expect(statusIcon("auto_approved")).toBe(checkCircle);
    });

    it("returns X for rejected", async () => {
      const { statusIcon, xCircle } = await import("../styles/icons.js");
      expect(statusIcon("rejected")).toBe(xCircle);
    });

    it("returns yellow circle for pending", async () => {
      const { statusIcon, alertCircle } = await import("../styles/icons.js");
      expect(statusIcon("pending")).toBe(alertCircle);
    });

    it("returns default circle for unknown", async () => {
      const { statusIcon, circle } = await import("../styles/icons.js");
      expect(statusIcon("unknown")).toBe(circle);
    });
  });

  describe("_resolveChannels", () => {
    it("marks all channels as disconnected when no stats", () => {
      const el = create();
      const channels = (el as any)._resolveChannels([]) as Array<{
        name: string;
        status: string;
      }>;
      expect(channels).toHaveLength(3);
      expect(channels.every((c: { status: string }) => c.status === "disconnected")).toBe(true);
    });

    it("marks channel as connected with pending count", () => {
      const el = create();
      const channels = (el as any)._resolveChannels([
        { channel: "whatsapp", total: 5, pending: 2, approved: 3, rejected: 0, auto_approved: 0 },
      ]) as Array<{ name: string; status: string; lastMessage: string }>;

      const wa = channels.find((c: { name: string }) => c.name === "whatsapp");
      expect(wa?.status).toBe("connected");
      expect(wa?.lastMessage).toBe("2 waiting");
    });

    it("marks channel as connected with no pending message when pending is 0", () => {
      const el = create();
      const channels = (el as any)._resolveChannels([
        { channel: "telegram", total: 3, pending: 0, approved: 3, rejected: 0, auto_approved: 0 },
      ]) as Array<{ name: string; status: string; lastMessage: string }>;

      const tg = channels.find((c: { name: string }) => c.name === "telegram");
      expect(tg?.status).toBe("connected");
      expect(tg?.lastMessage).toBe("");
    });

    it("handles case-insensitive channel names", () => {
      const el = create();
      const channels = (el as any)._resolveChannels([
        { channel: "WhatsApp", total: 1, pending: 0, approved: 1, rejected: 0, auto_approved: 0 },
      ]) as Array<{ name: string; status: string }>;

      const wa = channels.find((c: { name: string }) => c.name === "whatsapp");
      expect(wa?.status).toBe("connected");
    });
  });
});
