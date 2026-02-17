#!/usr/bin/env node

/**
 * Shopify MCP Server
 *
 * Exposes Shopify Admin API operations as MCP tools for Claude Code CLI.
 * Communicates over stdio transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ShopifyClient } from "./shopify-client.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerProductTools } from "./tools/products.js";

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2024-01";

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.error(
    "Missing required environment variables: SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN",
  );
  process.exit(1);
}

const shopifyClient = new ShopifyClient({
  storeUrl: SHOPIFY_STORE_URL,
  accessToken: SHOPIFY_ACCESS_TOKEN,
  apiVersion: SHOPIFY_API_VERSION,
});

const server = new McpServer({
  name: "shopify",
  version: "0.1.0",
});

// Register all tool groups
registerProductTools(server, shopifyClient);
registerOrderTools(server, shopifyClient);
registerInventoryTools(server, shopifyClient);
registerCustomerTools(server, shopifyClient);

// Start stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting Shopify MCP server:", err);
  process.exit(1);
});
