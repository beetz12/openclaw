/** Shared types for NotebookLM Memory MCP server */

export type KnowledgeCategory = "products" | "policies" | "customers" | "faq" | "all";

export interface MemoryConfig {
  /** Default notebook ID for business knowledge */
  notebookId: string | undefined;
  /** Business name used when creating notebooks */
  businessName: string;
}

export interface SourceInfo {
  id: string;
  title: string;
  type: string;
}

export interface KnowledgeStats {
  sourceCount: number;
  categories: string[];
  notebookId: string;
}

export interface QueryCounter {
  count: number;
  resetDate: string; // ISO date string (YYYY-MM-DD)
}

/** Category prefixes used to improve query retrieval quality */
export const CATEGORY_PREFIXES: Record<KnowledgeCategory, string> = {
  products: "Regarding product information, catalog, and inventory:",
  policies: "Regarding business policies, rules, and procedures:",
  customers: "Regarding customer information and history:",
  faq: "Regarding frequently asked questions and common issues:",
  all: "",
};

/** Category title prefixes for organizing sources */
export const CATEGORY_TITLE_PREFIXES: Record<string, string> = {
  products: "[Products]",
  policies: "[Policies]",
  customers: "[Customers]",
  faq: "[FAQ]",
};

/** Rate limit thresholds */
export const RATE_LIMITS = {
  FREE_DAILY: 50,
  PLUS_DAILY: 500,
  PRO_DAILY: 500,
  WARNING_THRESHOLD: 0.8, // Warn at 80% usage
} as const;
