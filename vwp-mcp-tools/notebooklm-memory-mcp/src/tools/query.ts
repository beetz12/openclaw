/**
 * Business knowledge query tool.
 *
 * Wraps notebooklm-mcp notebook_query with category-aware prefixing
 * to improve retrieval quality.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig, trackQuery } from "../notebook-client.js";
import { CATEGORY_PREFIXES, type KnowledgeCategory } from "../types.js";

export function registerQueryTools(server: McpServer): void {
  server.tool(
    "business_knowledge_query",
    "Query business knowledge stored in NotebookLM. Searches across products, policies, customers, FAQ, or all categories. Returns answers with source citations.",
    {
      query: z.string().describe("The question to ask about the business knowledge base"),
      category: z
        .enum(["products", "policies", "customers", "faq", "all"])
        .optional()
        .default("all")
        .describe("Knowledge category to search within"),
      notebook_id: z
        .string()
        .optional()
        .describe("Specific notebook ID to query (uses default if omitted)"),
    },
    async ({ query, category, notebook_id }) => {
      const config = getConfig();
      const targetNotebook = notebook_id || config.notebookId;

      if (!targetNotebook) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No notebook configured. Please run business_knowledge_init first to create a business knowledge notebook, or set the VWP_NOTEBOOK_ID environment variable.",
            },
          ],
          isError: true,
        };
      }

      // Track query and check rate limits
      const rateLimitWarning = trackQuery();

      // Build category-prefixed query
      const cat = (category || "all") as KnowledgeCategory;
      const prefix = CATEGORY_PREFIXES[cat];
      const prefixedQuery = prefix ? `${prefix} ${query}` : query;

      // Build instruction for the LLM to call notebooklm-mcp
      const parts: string[] = [];

      parts.push(
        `INSTRUCTION: Call the notebooklm-mcp notebook_query tool with the following parameters:`,
      );
      parts.push(`- notebook_id: "${targetNotebook}"`);
      parts.push(`- query: "${prefixedQuery}"`);
      parts.push("");
      parts.push(`Category filter: ${cat}`);
      parts.push(`Original query: ${query}`);

      if (rateLimitWarning) {
        parts.push("");
        parts.push(`WARNING: ${rateLimitWarning}`);
      }

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    },
  );
}
