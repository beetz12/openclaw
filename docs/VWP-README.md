# Virtual Workforce Platform (VWP)

## Overview

The VWP is a task orchestration and agent team management platform built on
[OpenClaw](https://github.com/nicepkg/openclaw). It provides:

- **Mission Control web UI** -- Next.js 15 / React 19 Kanban board for task management
- **Task dispatch with AI-powered decomposition** -- break goals into specialist subtasks
- **Multi-specialist agent teams** -- Claude CLI subprocesses running in parallel or sequence
- **Real-time agent monitoring** -- WebSocket + SSE streaming to the board UI
- **Workspace tools integration** -- Python CLI tools (content research, drafting, social media)
- **Approval workflows** -- user confirms or rejects agent-generated content before it ships
- **Cost tracking and budget enforcement** -- per-task and monthly spend caps
- **Production hardening** -- atomic writes, health monitoring, graceful shutdown

## Quick Start

Single-command startup via pnpm scripts:

```bash
pnpm vwp:start          # Web-only mode (recommended)
pnpm vwp:start:channels # With messaging channels
pnpm vwp:stop           # Stop everything
```

Or directly via shell scripts:

```bash
./scripts/start-vwp.sh
./scripts/start-vwp.sh --channels
./scripts/stop-vwp.sh
```

The start script launches:

- **OpenClaw Gateway** on `http://localhost:18789`
- **Mission Control (VWP Board)** on `http://localhost:3000`

## Prerequisites

- Node.js >= 22.12.0
- pnpm >= 10.23.0
- Python 3 (for workspace tools)
- At least one model provider (Anthropic recommended)

## Model Authentication

### Anthropic (Recommended)

```bash
openclaw models auth setup-token --provider anthropic
```

Uses Claude Pro/Max subscription via OAuth. Recommended model: Opus 4.6.

### OpenAI Codex (ChatGPT Plus/Pro Subscription)

```bash
openclaw models auth login --provider openai-codex
```

Uses ChatGPT Plus or Pro subscription via OAuth (PKCE flow). This opens your
browser for authentication.

Available models after login:

- `openai-codex/gpt-5.3-codex`
- `openai-codex/gpt-5.3-codex-spark`

Note: This only works for Codex models. For standard GPT models (gpt-4, gpt-4o),
use an API key instead:

```bash
# In .env
OPENAI_API_KEY=sk-...
```

### Other Providers

```bash
# Gemini
GEMINI_API_KEY=...

# OpenRouter
OPENROUTER_API_KEY=sk-or-...
```

## Environment Setup

```bash
cp .env.example .env
# Edit .env -- minimum required:
OPENCLAW_GATEWAY_TOKEN=<openssl rand -hex 32>
ANTHROPIC_API_KEY=sk-ant-...   # or use OAuth above
```

For workspace tools (content-suite):

```bash
REDDIT_CLIENT_ID=...
REDDIT_SECRET=...
BRAVE_API_KEY=...
```

## Build from Source

```bash
pnpm install
pnpm ui:build
pnpm build
```

## Architecture

```
User --> Mission Control (localhost:3000)
           |  HTTP/SSE
           v
         OpenClaw Gateway (localhost:18789)
           |
           v
         VWP Dispatch Plugin
           |-- Task Analysis (AI-powered decomposition)
           |-- Skill Registry (task --> specialist mapping)
           |-- Budget Check (per-task + monthly caps)
           +-- Team Launcher (Claude CLI subprocesses)
                |
                v
              Agent Teams (parallel/sequential execution)
                |
                v
              Results --> SSE --> Mission Control
                |
                v
              Approval Gate --> User confirms/rejects
```

## VWP Extensions

| Extension      | Purpose                                    |
| -------------- | ------------------------------------------ |
| vwp-dispatch   | Task dispatch, agent teams, tool execution |
| vwp-approval   | SSE-based approval queue                   |
| vwp-dashboard  | Lit web components mobile dashboard        |
| vwp-consulting | IT consultancy domain skills               |
| vwp-ecommerce  | E-commerce domain skills                   |

## Mission Control Features

- **Kanban Board** -- drag-and-drop task management with columns
- **Goal Input** -- submit tasks with AI decomposition
- **Agent Panel** -- real-time agent monitoring (desktop slide-over / mobile bottom sheet)
- **Workspace Tools** -- launch, monitor, cancel Python tools
- **Cost Dashboard** -- budget tracking and spend monitoring
- **Approval Workflows** -- approve/reject agent actions and messages
- **Onboarding** -- guided setup flow

## Workspace Tools

Python CLI tools in `tools/content-suite/`:

| Tool             | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| Reddit Scout     | Research Reddit for pain points, market signals   |
| X/Twitter Scout  | Research X for leads, trends, competitor analysis |
| Trend Scout      | Cross-platform trend analysis                     |
| Social Alchemist | Transform research into social content            |
| Content Drafter  | Draft long-form content from research             |

Install dependencies:

```bash
cd tools/content-suite
pip install -r requirements.txt
```

## Running Tests

```bash
pnpm test                                    # All unit tests
pnpm vitest run extensions/vwp-dispatch/     # Dispatch tests
cd apps/vwp-board && pnpm test:e2e           # Board E2E tests
```

## Logs and Troubleshooting

When started via `pnpm vwp:start`:

- Gateway log: `.vwp-logs/gateway.log`
- Board log: `.vwp-logs/board.log`
- PIDs tracked in `.vwp-pids`

Health check:

```bash
openclaw doctor
curl http://localhost:18789/health
```

## Project Structure

```
extensions/
  vwp-dispatch/       # Core: task dispatch + agent teams
  vwp-approval/       # Approval queue (SSE)
  vwp-dashboard/      # Mobile Lit dashboard
  vwp-consulting/     # IT consulting skills
  vwp-ecommerce/      # E-commerce skills
apps/
  vwp-board/          # Mission Control (Next.js 15)
packages/
  vwp-theme/          # Shared design tokens
tools/
  content-suite/      # Python workspace tools
scripts/
  start-vwp.sh        # Start entire stack
  stop-vwp.sh         # Stop entire stack
```
