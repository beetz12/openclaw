/**
 * Client that proxies calls to the notebooklm-mcp server tools.
 *
 * Since this MCP server runs alongside notebooklm-mcp in Claude Code,
 * the actual tool calls are made by the LLM. This module provides
 * instruction-based responses that guide the LLM to call the appropriate
 * notebooklm-mcp tools.
 *
 * In practice, this server returns structured instructions that the LLM
 * interprets and executes via the notebooklm-mcp tools.
 */

import { type MemoryConfig, type QueryCounter, RATE_LIMITS } from "./types.js";

let config: MemoryConfig = {
  notebookId: process.env.VWP_NOTEBOOK_ID,
  businessName: process.env.VWP_BUSINESS_NAME || "My Business",
};

const queryCounter: QueryCounter = {
  count: 0,
  resetDate: new Date().toISOString().slice(0, 10),
};

export function getConfig(): MemoryConfig {
  return config;
}

export function setNotebookId(id: string): void {
  config = { ...config, notebookId: id };
}

/**
 * Track query usage and return a warning if approaching rate limits.
 */
export function trackQuery(): string | null {
  const today = new Date().toISOString().slice(0, 10);
  if (queryCounter.resetDate !== today) {
    queryCounter.count = 0;
    queryCounter.resetDate = today;
  }
  queryCounter.count++;

  const threshold = Math.floor(RATE_LIMITS.FREE_DAILY * RATE_LIMITS.WARNING_THRESHOLD);
  if (queryCounter.count >= RATE_LIMITS.FREE_DAILY) {
    return `Rate limit reached: ${queryCounter.count}/${RATE_LIMITS.FREE_DAILY} queries used today. Queries may fail until tomorrow.`;
  }
  if (queryCounter.count >= threshold) {
    return `Rate limit warning: ${queryCounter.count}/${RATE_LIMITS.FREE_DAILY} queries used today (${Math.round((queryCounter.count / RATE_LIMITS.FREE_DAILY) * 100)}%).`;
  }
  return null;
}

export function getQueryCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (queryCounter.resetDate !== today) {
    queryCounter.count = 0;
    queryCounter.resetDate = today;
  }
  return queryCounter.count;
}
