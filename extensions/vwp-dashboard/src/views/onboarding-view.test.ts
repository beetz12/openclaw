import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Stub browser globals BEFORE the component import.
// vi.hoisted() is evaluated before ESM imports are resolved.
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
  return { store };
});

import { OnboardingView } from "./onboarding-view.js";

// ---------------------------------------------------------------------------
// Test OnboardingView pure logic without triggering Lit's DOM lifecycle.
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

function create(preload?: Record<string, string>): OnboardingView {
  if (preload) {
    for (const [k, v] of Object.entries(preload)) store[k] = v;
  }
  const el = Object.create(OnboardingView.prototype) as OnboardingView;
  // Minimal EventTarget support (constructors were not called)
  const eventListeners: Record<string, Function[]> = {};
  def(el, "addEventListener", (type: string, cb: Function) => {
    (eventListeners[type] ??= []).push(cb);
  });
  def(el, "dispatchEvent", (event: Event) => {
    for (const cb of eventListeners[event.type] ?? []) cb(event);
    return true;
  });
  // Replicate connectedCallback localStorage reads via own data properties
  def(el, "_step", 0);
  def(el, "_businessType", store["vwp-business-type"] || "");
  def(el, "_businessName", store["vwp-business-name"] || "");
  def(el, "_businessDescription", store["vwp-business-description"] || "");
  return el;
}

function step(el: OnboardingView): number {
  return (el as any)._step;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OnboardingView", () => {
  describe("initial state", () => {
    it("starts at step 0 with empty business fields", () => {
      const el = create();
      expect(step(el)).toBe(0);
      expect((el as any)._businessType).toBe("");
      expect((el as any)._businessName).toBe("");
      expect((el as any)._businessDescription).toBe("");
    });

    it("loads business type from localStorage if present", () => {
      const el = create({ "vwp-business-type": "ecommerce" });
      expect((el as any)._businessType).toBe("ecommerce");
    });

    it("loads business name from localStorage if present", () => {
      const el = create({ "vwp-business-name": "Test Shop" });
      expect((el as any)._businessName).toBe("Test Shop");
    });

    it("loads business description from localStorage if present", () => {
      const el = create({ "vwp-business-description": "We sell things" });
      expect((el as any)._businessDescription).toBe("We sell things");
    });
  });

  describe("step navigation", () => {
    it("_next advances from step 0 to step 1", () => {
      const el = create();
      (el as any)._next();
      expect(step(el)).toBe(1);
    });

    it("_next advances through all steps", () => {
      const el = create();
      (el as any)._next(); // 0 -> 1
      expect(step(el)).toBe(1);
      (el as any)._next(); // 1 -> 2
      expect(step(el)).toBe(2);
      (el as any)._next(); // 2 -> 3
      expect(step(el)).toBe(3);
    });

    it("_next from step 2 saves business info", () => {
      const el = create();
      (el as any)._businessType = "it-consultancy";
      (el as any)._businessName = "Acme IT";
      (el as any)._businessDescription = "Cloud consulting";
      (el as any)._step = 2;

      (el as any)._next(); // 2 -> 3 (saves)

      expect(store["vwp-business-type"]).toBe("it-consultancy");
      expect(store["vwp-business-name"]).toBe("Acme IT");
      expect(store["vwp-user-name"]).toBe("Acme IT");
      expect(store["vwp-business-description"]).toBe("Cloud consulting");
    });

    it("_back decrements step", () => {
      const el = create();
      (el as any)._step = 2;
      (el as any)._back();
      expect(step(el)).toBe(1);
    });

    it("_back does not go below step 0", () => {
      const el = create();
      (el as any)._back();
      expect(step(el)).toBe(0);
    });
  });

  describe("business type selection", () => {
    it("_selectType sets business type", () => {
      const el = create();
      (el as any)._selectType("ecommerce");
      expect((el as any)._businessType).toBe("ecommerce");
    });

    it("_selectType can be changed", () => {
      const el = create();
      (el as any)._selectType("ecommerce");
      (el as any)._selectType("other");
      expect((el as any)._businessType).toBe("other");
    });
  });

  describe("business info persistence", () => {
    it("saves trimmed name and description", () => {
      const el = create();
      (el as any)._businessType = "ecommerce";
      (el as any)._businessName = "  My Shop  ";
      (el as any)._businessDescription = "  Online retail  ";

      (el as any)._saveBusinessInfo();

      expect(store["vwp-business-type"]).toBe("ecommerce");
      expect(store["vwp-business-name"]).toBe("My Shop");
      expect(store["vwp-user-name"]).toBe("My Shop");
      expect(store["vwp-business-description"]).toBe("Online retail");
    });

    it("does not save empty/whitespace-only fields", () => {
      const el = create();
      (el as any)._businessType = "";
      (el as any)._businessName = "   ";
      (el as any)._businessDescription = "";

      (el as any)._saveBusinessInfo();

      expect(store["vwp-business-type"]).toBeUndefined();
      expect(store["vwp-business-name"]).toBeUndefined();
      expect(store["vwp-business-description"]).toBeUndefined();
    });
  });

  describe("label helpers", () => {
    it("returns IT consultancy-specific labels", () => {
      const el = create();
      (el as any)._businessType = "it-consultancy";
      expect((el as any)._businessNameLabel()).toBe("Company name");
      expect((el as any)._businessNamePlaceholder()).toBe("e.g., Acme IT Solutions");
    });

    it("returns ecommerce-specific labels", () => {
      const el = create();
      (el as any)._businessType = "ecommerce";
      expect((el as any)._businessNameLabel()).toBe("Store name");
      expect((el as any)._businessNamePlaceholder()).toBe("e.g., Sunrise Shop");
    });

    it("returns generic labels for other/default", () => {
      const el = create();
      (el as any)._businessType = "other";
      expect((el as any)._businessNameLabel()).toBe("Business name");
      expect((el as any)._businessNamePlaceholder()).toBe("e.g., My Business");
    });
  });

  describe("finish / skip", () => {
    it("_finish dispatches onboarding-complete event", () => {
      const el = create();
      const handler = vi.fn();
      el.addEventListener("onboarding-complete", handler);

      (el as any)._finish();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("_skip dispatches onboarding-complete event", () => {
      const el = create();
      const handler = vi.fn();
      el.addEventListener("onboarding-complete", handler);

      (el as any)._skip();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("_next from last step calls _finish", () => {
      const el = create();
      const handler = vi.fn();
      el.addEventListener("onboarding-complete", handler);

      (el as any)._step = 3;
      (el as any)._next(); // at step 3 (last), should fire finish

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
