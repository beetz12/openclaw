export type Route = "home" | "queue" | "tasks" | "business" | "more" | "onboarding";

const ROUTE_MAP: Record<string, Route> = {
  "/": "home",
  "/queue": "queue",
  "/tasks": "tasks",
  "/business": "business",
  "/more": "more",
  "/onboarding": "onboarding",
};

const ROUTE_PATHS: Record<Route, string> = {
  home: "/",
  queue: "/queue",
  tasks: "/tasks",
  business: "/business",
  more: "/more",
  onboarding: "/onboarding",
};

export function getCurrentRoute(): Route {
  const hash = window.location.hash.slice(1) || "/";
  const normalized = hash === "" ? "/" : hash;
  return ROUTE_MAP[normalized] ?? "home";
}

export function navigate(route: Route): void {
  window.location.hash = `#${ROUTE_PATHS[route]}`;
}

export function navigateToPath(path: string): void {
  window.location.hash = `#${path}`;
}

type RouteChangeCallback = (route: Route) => void;

const listeners: RouteChangeCallback[] = [];

export function onRouteChange(cb: RouteChangeCallback): () => void {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function handleHashChange() {
  const route = getCurrentRoute();
  for (const cb of listeners) {
    cb(route);
  }
}

window.addEventListener("hashchange", handleHashChange);
