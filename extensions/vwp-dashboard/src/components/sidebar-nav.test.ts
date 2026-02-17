import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { origin: "http://localhost:3000", hash: "" },
  };
});

import { SidebarNav } from "./sidebar-nav.js";

function def(obj: any, key: string, value: any) {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true });
}

function create(): SidebarNav {
  const el = Object.create(SidebarNav.prototype) as SidebarNav;
  def(el, "activeRoute", "home");
  def(el, "queueCount", 0);
  def(el, "taskCount", 0);
  return el;
}

describe("SidebarNav", () => {
  it("creates with default properties", () => {
    const el = create();
    expect(el.activeRoute).toBe("home");
    expect(el.queueCount).toBe(0);
    expect(el.taskCount).toBe(0);
  });

  it("accepts route and count properties", () => {
    const el = create();
    def(el, "activeRoute", "queue");
    def(el, "queueCount", 5);
    def(el, "taskCount", 3);
    expect(el.activeRoute).toBe("queue");
    expect(el.queueCount).toBe(5);
    expect(el.taskCount).toBe(3);
  });
});
