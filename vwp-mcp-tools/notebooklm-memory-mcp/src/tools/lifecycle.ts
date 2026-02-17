/**
 * Notebook lifecycle tools.
 *
 * Create and initialize business knowledge notebooks,
 * and provide usage statistics.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig, getQueryCount } from "../notebook-client.js";
import { RATE_LIMITS } from "../types.js";

export function registerLifecycleTools(server: McpServer): void {
  // Initialize a business knowledge notebook
  server.tool(
    "business_knowledge_init",
    "Initialize a new NotebookLM notebook for business knowledge. Creates the notebook and sets it as the default for future queries.",
    {
      business_name: z.string().describe("Name of the business (used as notebook title)"),
    },
    async ({ business_name }) => {
      const parts: string[] = [];
      parts.push(`INSTRUCTION: Follow these steps to initialize the business knowledge notebook:`);
      parts.push("");
      parts.push(
        `1. Call notebooklm-mcp notebook_create with name: "${business_name} - Business Knowledge"`,
      );
      parts.push(`2. Note the returned notebook_id`);
      parts.push(`3. Add the following initial text sources to the notebook:`);
      parts.push("");
      parts.push(`   Source A - Call source_add with:`);
      parts.push(`   - type: "text"`);
      parts.push(`   - title: "[Products] Product Catalog Overview"`);
      parts.push(
        `   - content: "This is the product knowledge base for ${business_name}. Add product descriptions, specifications, pricing, and inventory information as separate sources with the [Products] prefix."`,
      );
      parts.push("");
      parts.push(`   Source B - Call source_add with:`);
      parts.push(`   - type: "text"`);
      parts.push(`   - title: "[Policies] Business Policies Overview"`);
      parts.push(
        `   - content: "This is the policies knowledge base for ${business_name}. Add return policies, shipping policies, terms of service, and other business rules as separate sources with the [Policies] prefix."`,
      );
      parts.push("");
      parts.push(`   Source C - Call source_add with:`);
      parts.push(`   - type: "text"`);
      parts.push(`   - title: "[FAQ] Frequently Asked Questions"`);
      parts.push(
        `   - content: "This is the FAQ knowledge base for ${business_name}. Add common customer questions and answers as separate sources with the [FAQ] prefix."`,
      );
      parts.push("");
      parts.push(
        `4. After creating the notebook, set the VWP_NOTEBOOK_ID environment variable to the notebook_id for future use.`,
      );

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    },
  );

  // Get knowledge base statistics
  server.tool(
    "business_knowledge_stats",
    "Get statistics about the business knowledge base, including source count, query usage, and rate limit status.",
    {
      notebook_id: z.string().optional().describe("Specific notebook ID (uses default if omitted)"),
    },
    async ({ notebook_id }) => {
      const config = getConfig();
      const targetNotebook = notebook_id || config.notebookId;

      if (!targetNotebook) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No notebook configured. Please run business_knowledge_init first.",
            },
          ],
          isError: true,
        };
      }

      const queryCount = getQueryCount();
      const usagePercent = Math.round((queryCount / RATE_LIMITS.FREE_DAILY) * 100);

      const parts: string[] = [];
      parts.push("Business Knowledge Base Statistics");
      parts.push("==================================");
      parts.push("");
      parts.push(`Notebook ID: ${targetNotebook}`);
      parts.push(`Business: ${config.businessName}`);
      parts.push("");
      parts.push("Query Usage (today):");
      parts.push(`  Queries used: ${queryCount}/${RATE_LIMITS.FREE_DAILY} (Free tier)`);
      parts.push(`  Usage: ${usagePercent}%`);
      if (queryCount >= RATE_LIMITS.FREE_DAILY) {
        parts.push("  STATUS: LIMIT REACHED - queries may fail until tomorrow");
      } else if (queryCount >= Math.floor(RATE_LIMITS.FREE_DAILY * RATE_LIMITS.WARNING_THRESHOLD)) {
        parts.push("  STATUS: APPROACHING LIMIT - consider reducing query frequency");
      } else {
        parts.push("  STATUS: OK");
      }
      parts.push("");
      parts.push(
        `INSTRUCTION: To get source counts, call notebooklm-mcp source_list_drive with notebook_id: "${targetNotebook}" and count sources by category prefix.`,
      );

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    },
  );
}
