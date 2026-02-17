# NotebookLM Memory MCP Server

MCP server that wraps NotebookLM as a business knowledge/memory layer for Claude Code. Provides a clean, business-domain-specific interface for querying and managing business knowledge stored in NotebookLM notebooks.

## What It Does

Instead of generic notebook operations, this server exposes business-focused tools:

- **`business_knowledge_query`** - Query business knowledge with category-aware context (products, policies, customers, FAQ)
- **`business_knowledge_add`** - Add text-based business knowledge with category tagging
- **`business_knowledge_add_document`** - Add document files (PDF, TXT, etc.) as knowledge sources
- **`business_knowledge_list_sources`** - List all knowledge sources organized by category
- **`business_knowledge_init`** - Initialize a new business knowledge notebook with starter templates
- **`business_knowledge_stats`** - View query usage, rate limits, and knowledge base statistics

## Prerequisites

- Node.js 22+
- The `notebooklm-mcp` server must be configured and running in your Claude Code environment
- A NotebookLM account (free tier works, paid tiers have higher limits)

## Configuration

### Environment Variables

| Variable            | Required | Description                                                                         |
| ------------------- | -------- | ----------------------------------------------------------------------------------- |
| `VWP_NOTEBOOK_ID`   | No       | Default notebook ID. Created on first use via `business_knowledge_init` if not set. |
| `VWP_BUSINESS_NAME` | No       | Business name for notebook creation. Defaults to "My Business".                     |

### Claude Code MCP Config

Add to your Claude Code MCP configuration (`.claude/mcp.json` or similar):

```json
{
  "mcpServers": {
    "notebooklm-memory": {
      "command": "node",
      "args": ["path/to/vwp-mcp-tools/notebooklm-memory-mcp/dist/index.js"],
      "env": {
        "VWP_NOTEBOOK_ID": "your-notebook-id",
        "VWP_BUSINESS_NAME": "Your Business Name"
      }
    }
  }
}
```

## Getting Started

### 1. Build the server

```bash
cd vwp-mcp-tools/notebooklm-memory-mcp
npm install
npm run build
```

### 2. Initialize your business knowledge base

Use the `business_knowledge_init` tool with your business name. This creates a NotebookLM notebook with starter templates for products, policies, and FAQ categories.

### 3. Add knowledge

Use `business_knowledge_add` to add text content, or `business_knowledge_add_document` to add files. Content is automatically categorized with title prefixes for organized retrieval.

### 4. Query your knowledge base

Use `business_knowledge_query` with optional category filtering. The server adds category context to improve retrieval quality.

## Architecture

This server acts as a proxy layer. It does not call the NotebookLM API directly. Instead, it returns structured instructions that guide the LLM to call the underlying `notebooklm-mcp` tools with the correct parameters, category prefixes, and business context.

```
Claude Code CLI
  -> notebooklm-memory-mcp (this server: business abstraction)
    -> notebooklm-mcp (underlying: raw NotebookLM API)
      -> NotebookLM
```

## Rate Limit Considerations

NotebookLM has daily query limits:

| Tier | Queries/Day | Sources/Notebook | Cost   |
| ---- | ----------- | ---------------- | ------ |
| Free | 50          | 50               | $0     |
| Plus | 500         | 100              | $20/mo |
| Pro  | 500         | 300              | $50/mo |

This server tracks queries per day and warns when approaching the limit (at 80% usage). The `business_knowledge_stats` tool shows current usage.

## Knowledge Categories

Sources are organized with title prefixes:

- `[Products]` - Product catalog, specs, pricing, inventory
- `[Policies]` - Return policies, shipping, terms of service
- `[Customers]` - Customer information and history
- `[FAQ]` - Frequently asked questions and answers

When querying with a category filter, the query is prefixed with category context to improve retrieval relevance.
