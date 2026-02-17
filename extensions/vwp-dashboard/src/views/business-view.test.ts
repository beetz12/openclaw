import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Stub browser globals BEFORE the component import.
// vi.hoisted() is evaluated before ESM imports are resolved.
// business-view imports router.js which uses window.addEventListener at module
// level, so window must exist before the import resolves.
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
  return { store };
});

import { BusinessView } from "./business-view.js";

// ---------------------------------------------------------------------------
// Test BusinessView pure logic without triggering Lit's DOM lifecycle.
// ---------------------------------------------------------------------------

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

/** Set an own data property that shadows the Lit @state() prototype accessor. */
function def(obj: any, key: string, value: any) {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true });
}

function create(preload?: Record<string, string>): BusinessView {
  if (preload) {
    for (const [k, v] of Object.entries(preload)) store[k] = v;
  }
  const el = Object.create(BusinessView.prototype) as BusinessView;
  // Replicate _loadData from connectedCallback
  def(el, "_businessName", store["vwp-business-name"] || "");
  def(el, "_businessType", store["vwp-business-type"] || "");
  def(el, "_businessDescription", store["vwp-business-description"] || "");
  def(el, "_editing", false);
  def(el, "_editName", "");
  def(el, "_editType", "");
  def(el, "_editDescription", "");
  return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BusinessView", () => {
  describe("data loading", () => {
    it("loads all fields from localStorage", () => {
      const el = create({
        "vwp-business-name": "Test Corp",
        "vwp-business-type": "it-consultancy",
        "vwp-business-description": "We do IT things",
      });

      expect((el as any)._businessName).toBe("Test Corp");
      expect((el as any)._businessType).toBe("it-consultancy");
      expect((el as any)._businessDescription).toBe("We do IT things");
    });

    it("defaults to empty strings when localStorage is empty", () => {
      const el = create();
      expect((el as any)._businessName).toBe("");
      expect((el as any)._businessType).toBe("");
      expect((el as any)._businessDescription).toBe("");
    });

    it("handles partial data (only name set)", () => {
      const el = create({ "vwp-business-name": "Partial Corp" });
      expect((el as any)._businessName).toBe("Partial Corp");
      expect((el as any)._businessType).toBe("");
    });
  });

  describe("_hasData", () => {
    it("returns false when all fields empty", () => {
      const el = create();
      expect((el as any)._hasData()).toBe(false);
    });

    it("returns true when name is set", () => {
      const el = create({ "vwp-business-name": "Test" });
      expect((el as any)._hasData()).toBe(true);
    });

    it("returns true when type is set", () => {
      const el = create({ "vwp-business-type": "other" });
      expect((el as any)._hasData()).toBe(true);
    });

    it("returns true when description is set", () => {
      const el = create({ "vwp-business-description": "desc" });
      expect((el as any)._hasData()).toBe(true);
    });
  });

  describe("_typeLabel", () => {
    it("maps it-consultancy to 'IT Consultancy'", () => {
      const el = create();
      expect((el as any)._typeLabel("it-consultancy")).toBe("IT Consultancy");
    });

    it("maps ecommerce to 'Ecommerce Business'", () => {
      const el = create();
      expect((el as any)._typeLabel("ecommerce")).toBe("Ecommerce Business");
    });

    it("maps other to 'Other Business'", () => {
      const el = create();
      expect((el as any)._typeLabel("other")).toBe("Other Business");
    });

    it("returns raw string for unknown type", () => {
      const el = create();
      expect((el as any)._typeLabel("custom-type")).toBe("custom-type");
    });
  });

  describe("inline edit mode", () => {
    it("starts with _editing as false", () => {
      const el = create();
      expect((el as any)._editing).toBe(false);
    });

    it("toggles edit mode when _startEditing is called", () => {
      const el = create({
        "vwp-business-name": "Test Corp",
        "vwp-business-type": "it-consultancy",
        "vwp-business-description": "We do IT things",
      });

      (el as any)._startEditing();

      expect((el as any)._editing).toBe(true);
      expect((el as any)._editName).toBe("Test Corp");
      expect((el as any)._editType).toBe("it-consultancy");
      expect((el as any)._editDescription).toBe("We do IT things");
    });

    it("saves changes to localStorage when _saveEditing is called", () => {
      const el = create();
      def(el, "_editName", "New Corp");
      def(el, "_editType", "ecommerce");
      def(el, "_editDescription", "New description");
      def(el, "_editing", true);

      (el as any)._saveEditing();

      expect(store["vwp-business-name"]).toBe("New Corp");
      expect(store["vwp-user-name"]).toBe("New Corp");
      expect(store["vwp-business-type"]).toBe("ecommerce");
      expect(store["vwp-business-description"]).toBe("New description");
      expect((el as any)._editing).toBe(false);
    });

    it("reloads from localStorage when _cancelEditing is called", () => {
      const el = create({
        "vwp-business-name": "Original Corp",
        "vwp-business-type": "other",
      });

      def(el, "_editing", true);
      def(el, "_editName", "Changed Corp");

      (el as any)._cancelEditing();

      expect((el as any)._editing).toBe(false);
      expect((el as any)._businessName).toBe("Original Corp");
    });

    it("trims whitespace when saving name and description", () => {
      const el = create();
      def(el, "_editName", "  Trimmed Corp  ");
      def(el, "_editDescription", "  Trimmed desc  ");
      def(el, "_editing", true);

      (el as any)._saveEditing();

      expect(store["vwp-business-name"]).toBe("Trimmed Corp");
      expect(store["vwp-business-description"]).toBe("Trimmed desc");
    });
  });
});
