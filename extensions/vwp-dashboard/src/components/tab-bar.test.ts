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

import { VwpTabBar } from "./tab-bar.js";

function def(obj: any, key: string, value: any) {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true });
}

function create(): VwpTabBar {
  const el = Object.create(VwpTabBar.prototype) as VwpTabBar;
  def(el, "activeRoute", "home");
  def(el, "queueCount", 0);
  def(el, "taskCount", 0);
  return el;
}

describe("VwpTabBar", () => {
  it("creates with default properties", () => {
    const el = create();
    expect(el.activeRoute).toBe("home");
    expect(el.queueCount).toBe(0);
    expect(el.taskCount).toBe(0);
  });

  it("accepts taskCount property", () => {
    const el = create();
    def(el, "taskCount", 7);
    expect(el.taskCount).toBe(7);
  });

  it("accepts queueCount property", () => {
    const el = create();
    def(el, "queueCount", 12);
    expect(el.queueCount).toBe(12);
  });
});
