# Shopify MCP Server

A local MCP (Model Context Protocol) server that exposes Shopify Admin API operations as tools for Claude Code CLI. When configured, Claude Code can look up products, orders, customers, and inventory directly from your Shopify store.

## Prerequisites

- Node.js 22+
- A Shopify store with Admin API access
- A Shopify Admin API access token (Custom App)

## Getting a Shopify Access Token

1. Log in to your Shopify Admin at `https://your-store.myshopify.com/admin`
2. Go to **Settings** > **Apps and sales channels** > **Develop apps**
3. Click **Create an app**, give it a name
4. Under **Configuration**, click **Configure Admin API scopes**
5. Enable the following scopes:
   - `read_products`
   - `read_orders`
   - `read_customers`
   - `read_inventory`
6. Click **Save**, then **Install app**
7. Under **API credentials**, reveal and copy the **Admin API access token** (starts with `shpat_`)

## Installation

```bash
cd vwp-mcp-tools/shopify-mcp
npm install
npm run build
```

## Claude Code MCP Configuration

Add this to your Claude Code MCP settings (`.claude/mcp.json` or project-level config):

```json
{
  "mcpServers": {
    "shopify": {
      "command": "node",
      "args": ["path/to/vwp-mcp-tools/shopify-mcp/dist/index.js"],
      "env": {
        "SHOPIFY_STORE_URL": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxx"
      }
    }
  }
}
```

## Available Tools

| Tool                    | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `shopify_get_products`  | List products with optional filters (title, collection, status) |
| `shopify_get_product`   | Get full details for a single product by ID                     |
| `shopify_get_orders`    | List recent orders with optional filters (status, email)        |
| `shopify_get_order`     | Get full order details including fulfillments and shipping      |
| `shopify_get_inventory` | Get inventory levels per variant per location                   |
| `shopify_get_customer`  | Look up a customer by email, phone, or customer ID              |

## Environment Variables

| Variable               | Required | Description                                                |
| ---------------------- | -------- | ---------------------------------------------------------- |
| `SHOPIFY_STORE_URL`    | Yes      | Your Shopify store domain (e.g., `my-store.myshopify.com`) |
| `SHOPIFY_ACCESS_TOKEN` | Yes      | Admin API access token (starts with `shpat_`)              |
| `SHOPIFY_API_VERSION`  | No       | API version (default: `2024-01`)                           |

## Development

```bash
npm run dev    # Watch mode - recompiles on changes
npm run build  # One-time build
npm start      # Run the server (requires env vars)
```
