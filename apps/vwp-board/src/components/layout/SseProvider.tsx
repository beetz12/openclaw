"use client";

import { useSse } from "@/hooks/useSse";

/**
 * Client component that initializes the SSE connection at the layout level.
 * Must be mounted in the root layout so all pages share the same connection.
 */
export function SseProvider() {
  useSse();
  return null;
}
