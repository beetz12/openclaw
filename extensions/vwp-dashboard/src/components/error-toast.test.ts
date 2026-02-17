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

import { ErrorToast } from "./error-toast.js";

function def(obj: any, key: string, value: any) {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true });
}

function create(): ErrorToast {
  const el = Object.create(ErrorToast.prototype) as ErrorToast;
  def(el, "_message", "");
  def(el, "_visible", false);
  def(el, "_hiding", false);
  def(el, "_timer", null);
  return el;
}

describe("ErrorToast", () => {
  it("show sets message and visible", () => {
    const el = create();
    vi.useFakeTimers();
    (el as any).show("Something went wrong");
    expect((el as any)._message).toBe("Something went wrong");
    expect((el as any)._visible).toBe(true);
    expect((el as any)._hiding).toBe(false);
    vi.useRealTimers();
  });

  it("show replaces previous message", () => {
    const el = create();
    vi.useFakeTimers();
    (el as any).show("First error");
    (el as any).show("Second error");
    expect((el as any)._message).toBe("Second error");
    vi.useRealTimers();
  });

  it("auto-dismisses after timeout", () => {
    const el = create();
    vi.useFakeTimers();
    (el as any).show("Error");
    expect((el as any)._visible).toBe(true);
    vi.advanceTimersByTime(4000);
    expect((el as any)._hiding).toBe(true);
    vi.advanceTimersByTime(200);
    expect((el as any)._visible).toBe(false);
    expect((el as any)._message).toBe("");
    vi.useRealTimers();
  });
});
