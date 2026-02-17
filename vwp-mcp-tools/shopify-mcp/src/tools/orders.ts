import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ShopifyClient } from "../shopify-client.js";

export function registerOrderTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "shopify_get_orders",
    "List recent orders from the Shopify store. Filter by status or customer email.",
    {
      limit: z
        .number()
        .min(1)
        .max(250)
        .optional()
        .describe("Max orders to return (1-250, default 50)"),
      status: z
        .enum(["open", "closed", "cancelled", "any"])
        .optional()
        .describe("Order status filter"),
      email: z.string().optional().describe("Filter orders by customer email"),
      since_id: z.string().optional().describe("Return orders after this order ID"),
    },
    async (params) => {
      const orders = await client.getOrders({
        limit: params.limit,
        status: params.status,
        email: params.email,
        since_id: params.since_id,
      });

      const summary = orders.map((o) => ({
        id: o.id,
        order_number: o.order_number,
        name: o.name,
        email: o.email,
        total_price: `${o.total_price} ${o.currency}`,
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status,
        line_items: o.line_items.map((li) => ({
          title: li.title,
          quantity: li.quantity,
          price: li.price,
          sku: li.sku,
        })),
        created_at: o.created_at,
        tags: o.tags,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.tool(
    "shopify_get_order",
    "Get full details for a single Shopify order, including fulfillments and shipping address.",
    {
      order_id: z.string().describe("The Shopify order ID"),
    },
    async (params) => {
      const order = await client.getOrder(params.order_id);

      return {
        content: [{ type: "text", text: JSON.stringify(order, null, 2) }],
      };
    },
  );
}
