import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ShopifyClient } from "../shopify-client.js";

export function registerProductTools(server: McpServer, client: ShopifyClient) {
  server.tool(
    "shopify_get_products",
    "List products from the Shopify store. Filter by title, collection, or status.",
    {
      limit: z
        .number()
        .min(1)
        .max(250)
        .optional()
        .describe("Max products to return (1-250, default 50)"),
      title: z.string().optional().describe("Filter by exact product title"),
      collection_id: z.string().optional().describe("Filter by collection ID"),
      status: z
        .enum(["active", "archived", "draft"])
        .optional()
        .describe("Filter by product status"),
    },
    async (params) => {
      const products = await client.getProducts({
        limit: params.limit,
        title: params.title,
        collection_id: params.collection_id,
        status: params.status,
      });

      const summary = products.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        vendor: p.vendor,
        product_type: p.product_type,
        variants: p.variants.map((v) => ({
          id: v.id,
          title: v.title,
          price: v.price,
          sku: v.sku,
          inventory_quantity: v.inventory_quantity,
        })),
        images: p.images.map((i) => ({ src: i.src, alt: i.alt })),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.tool(
    "shopify_get_product",
    "Get full details for a single Shopify product by ID.",
    {
      product_id: z.string().describe("The Shopify product ID"),
    },
    async (params) => {
      const product = await client.getProduct(params.product_id);

      return {
        content: [{ type: "text", text: JSON.stringify(product, null, 2) }],
      };
    },
  );
}
