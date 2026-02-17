import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ShopifyClient } from "../shopify-client.js";

export function registerInventoryTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "shopify_get_inventory",
    "Get inventory levels for products. Provide a product_id to see stock per variant per location, or a location_id to see all inventory at that location.",
    {
      product_id: z.string().optional().describe("Shopify product ID to check inventory for"),
      location_id: z.string().optional().describe("Shopify location ID to check inventory at"),
    },
    async (params) => {
      if (!params.product_id && !params.location_id) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Must provide at least one of product_id or location_id",
            },
          ],
          isError: true,
        };
      }

      const levels = await client.getInventoryLevels({
        product_id: params.product_id,
        location_id: params.location_id,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(levels, null, 2) }],
      };
    },
  );
}
