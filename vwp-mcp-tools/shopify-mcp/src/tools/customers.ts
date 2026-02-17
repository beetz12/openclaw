import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ShopifyClient } from "../shopify-client.js";

export function registerCustomerTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "shopify_get_customer",
    "Look up a Shopify customer by email, phone, or customer ID. Returns customer details, order count, total spent, and tags.",
    {
      email: z.string().optional().describe("Customer email address"),
      phone: z.string().optional().describe("Customer phone number"),
      customer_id: z.string().optional().describe("Shopify customer ID for direct lookup"),
    },
    async (params) => {
      if (!params.email && !params.phone && !params.customer_id) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Must provide at least one of email, phone, or customer_id",
            },
          ],
          isError: true,
        };
      }

      const result = await client.searchCustomers({
        email: params.email,
        phone: params.phone,
        customer_id: params.customer_id,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
