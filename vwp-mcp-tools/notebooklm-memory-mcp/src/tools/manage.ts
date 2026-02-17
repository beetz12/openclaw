/**
 * Business knowledge management tools.
 *
 * Add, list, and remove knowledge sources from the NotebookLM notebook.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig } from "../notebook-client.js";
import { CATEGORY_TITLE_PREFIXES } from "../types.js";

export function registerManageTools(server: McpServer): void {
  // Add text-based business knowledge
  server.tool(
    "business_knowledge_add",
    "Add business knowledge as a text source to the NotebookLM notebook. Content is categorized for better retrieval.",
    {
      content: z.string().describe("The knowledge content to add"),
      title: z.string().describe("A descriptive title for this knowledge source"),
      category: z
        .string()
        .describe('Category for this knowledge (e.g., "products", "policies", "customers", "faq")'),
      notebook_id: z.string().optional().describe("Specific notebook ID (uses default if omitted)"),
    },
    async ({ content, title, category, notebook_id }) => {
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

      // Build prefixed title for organization
      const prefix =
        CATEGORY_TITLE_PREFIXES[category] ||
        `[${category.charAt(0).toUpperCase() + category.slice(1)}]`;
      const prefixedTitle = `${prefix} ${title}`;

      const parts: string[] = [];
      parts.push(
        `INSTRUCTION: Call the notebooklm-mcp source_add tool with the following parameters:`,
      );
      parts.push(`- notebook_id: "${targetNotebook}"`);
      parts.push(`- type: "text"`);
      parts.push(`- title: "${prefixedTitle}"`);
      parts.push(`- content: (the content provided below)`);
      parts.push("");
      parts.push("--- Content to add ---");
      parts.push(content);
      parts.push("--- End content ---");

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    },
  );

  // Add a document file as knowledge source
  server.tool(
    "business_knowledge_add_document",
    "Add a document file (PDF, TXT, etc.) as a knowledge source to the NotebookLM notebook.",
    {
      file_path: z.string().describe("Absolute path to the document file to add"),
      category: z.string().optional().describe("Category for this knowledge source"),
      notebook_id: z.string().optional().describe("Specific notebook ID (uses default if omitted)"),
    },
    async ({ file_path, category, notebook_id }) => {
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

      const parts: string[] = [];
      parts.push(
        `INSTRUCTION: Call the notebooklm-mcp source_add tool with the following parameters:`,
      );
      parts.push(`- notebook_id: "${targetNotebook}"`);
      parts.push(`- type: "file"`);
      parts.push(`- file_path: "${file_path}"`);
      if (category) {
        parts.push(`- Category tag: "${category}"`);
      }

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    },
  );

  // List all knowledge sources
  server.tool(
    "business_knowledge_list_sources",
    "List all knowledge sources in the business NotebookLM notebook.",
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

      const parts: string[] = [];
      parts.push(
        `INSTRUCTION: Call the notebooklm-mcp source_list_drive tool with the following parameters:`,
      );
      parts.push(`- notebook_id: "${targetNotebook}"`);
      parts.push("");
      parts.push(
        "Then organize the results by category prefix ([Products], [Policies], [Customers], [FAQ]).",
      );

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    },
  );
}
