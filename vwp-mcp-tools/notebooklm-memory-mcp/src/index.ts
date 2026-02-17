#!/usr/bin/env node

/**
 * NotebookLM Memory MCP Server
 *
 * Wraps NotebookLM as a business knowledge/memory layer for Claude Code.
 * Provides business-domain-specific tools for querying and managing
 * knowledge stored in NotebookLM notebooks.
 *
 * This server proxies calls through the existing notebooklm-mcp server
 * by returning structured instructions that the LLM executes.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerLifecycleTools } from "./tools/lifecycle.js";
import { registerManageTools } from "./tools/manage.js";
import { registerQueryTools } from "./tools/query.js";

const server = new McpServer(
  {
    name: "notebooklm-memory",
    version: "0.1.0",
  },
  {
    capabilities: {
      logging: {},
    },
  },
);

// Register all tool groups
registerQueryTools(server);
registerManageTools(server);
registerLifecycleTools(server);

// Connect via stdio transport for Claude Code integration
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
