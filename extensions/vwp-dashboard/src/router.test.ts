import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// We test the router module's pure logic.  The module reads `window.location`
// and registers a global "hashchange" listener at import time, so we stub the
// globals *before* the dynamic import and tear them down afterwards.
// ---------------------------------------------------------------------------

let router: typeof import("./router.js");
let hashChangeHandlers: Array<() => void>;

beforeEach(async () => {
  hashChangeHandlers = [];

  // Stub window.location with a mutable hash
  const loc = {
    hash: "",
    origin: "http://localhost",
    href: "http://localhost",
  };
  vi.stubGlobal("window", {
    location: loc,
    addEventListener: (_event: string, handler: () => void) => {
      hashChangeHandlers.push(handler);
    },
    removeEventListener: vi.fn(),
    history: { back: vi.fn() },
  });

  // Dynamic import to capture the stubs
  router = await import("./router.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// getCurrentRoute
// ---------------------------------------------------------------------------

describe("getCurrentRoute", () => {
  it("returns 'home' for empty hash", () => {
    window.location.hash = "";
    expect(router.getCurrentRoute()).toBe("home");
  });

  it("returns 'home' for #/", () => {
    window.location.hash = "#/";
    expect(router.getCurrentRoute()).toBe("home");
  });

  it("returns 'queue' for #/queue", () => {
    window.location.hash = "#/queue";
    expect(router.getCurrentRoute()).toBe("queue");
  });

  it("returns 'business' for #/business", () => {
    window.location.hash = "#/business";
    expect(router.getCurrentRoute()).toBe("business");
  });

  it("returns 'more' for #/more", () => {
    window.location.hash = "#/more";
    expect(router.getCurrentRoute()).toBe("more");
  });

  it("returns 'onboarding' for #/onboarding", () => {
    window.location.hash = "#/onboarding";
    expect(router.getCurrentRoute()).toBe("onboarding");
  });

  it("defaults to 'home' for unknown hash", () => {
    window.location.hash = "#/unknown-route";
    expect(router.getCurrentRoute()).toBe("home");
  });
});

// ---------------------------------------------------------------------------
// navigate
// ---------------------------------------------------------------------------

describe("navigate", () => {
  it("sets hash for home route", () => {
    router.navigate("home");
    expect(window.location.hash).toBe("#/");
  });

  it("sets hash for queue route", () => {
    router.navigate("queue");
    expect(window.location.hash).toBe("#/queue");
  });

  it("sets hash for business route", () => {
    router.navigate("business");
    expect(window.location.hash).toBe("#/business");
  });

  it("sets hash for more route", () => {
    router.navigate("more");
    expect(window.location.hash).toBe("#/more");
  });

  it("sets hash for onboarding route", () => {
    router.navigate("onboarding");
    expect(window.location.hash).toBe("#/onboarding");
  });
});

// ---------------------------------------------------------------------------
// navigateToPath
// ---------------------------------------------------------------------------

describe("navigateToPath", () => {
  it("sets hash to arbitrary path", () => {
    router.navigateToPath("/custom/path");
    expect(window.location.hash).toBe("#/custom/path");
  });
});

// ---------------------------------------------------------------------------
// onRouteChange
// ---------------------------------------------------------------------------

describe("onRouteChange", () => {
  it("fires callback on hashchange", () => {
    const cb = vi.fn();
    router.onRouteChange(cb);

    window.location.hash = "#/queue";
    // Simulate hashchange event
    for (const handler of hashChangeHandlers) handler();

    expect(cb).toHaveBeenCalledWith("queue");
  });

  it("returns an unsubscribe function", () => {
    const cb = vi.fn();
    const unsub = router.onRouteChange(cb);

    unsub();

    window.location.hash = "#/business";
    for (const handler of hashChangeHandlers) handler();

    expect(cb).not.toHaveBeenCalled();
  });

  it("supports multiple listeners", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    router.onRouteChange(cb1);
    router.onRouteChange(cb2);

    window.location.hash = "#/more";
    for (const handler of hashChangeHandlers) handler();

    expect(cb1).toHaveBeenCalledWith("more");
    expect(cb2).toHaveBeenCalledWith("more");
  });

  it("unsubscribing one listener doesn't affect others", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = router.onRouteChange(cb1);
    router.onRouteChange(cb2);

    unsub1();

    window.location.hash = "#/queue";
    for (const handler of hashChangeHandlers) handler();

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith("queue");
  });
});
