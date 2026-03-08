<p align="center">
  <img src="https://img.shields.io/badge/NexClaw-Virtual_Workforce_Platform-0066FF?style=for-the-badge&logoColor=white" alt="NexClaw">
</p>

<h1 align="center">NexClaw</h1>

<p align="center">
  <strong>Your AI-Powered Virtual Workforce</strong><br>
  <em>Delegate tasks, manage agent teams, and ship work — all from a single command.</em>
</p>

<p align="center">
  <a href="https://github.com/openclaw/openclaw"><img src="https://img.shields.io/badge/Built_on-OpenClaw-333?style=flat-square" alt="Built on OpenClaw"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Next.js-15-000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js">
</p>

---

**NexClaw** is a custom build of [OpenClaw](https://github.com/openclaw/openclaw) by [NexAI Advisors](https://nexaiadvisors.com) — purpose-built to function as your **virtual workforce**. Where OpenClaw gives you a personal AI assistant, NexClaw gives you an entire AI-powered team: task dispatch, specialist agent coordination, real-time monitoring, content generation, and human-in-the-loop approval workflows — all orchestrated from a sleek Mission Control dashboard.

Built on the shoulders of giants and kept in sync with the official OpenClaw repository, NexClaw inherits every upstream feature — 14 messaging channels, 20+ model providers, voice calls, memory systems, cron automation — while adding a complete business operations layer on top.

---

## What Makes NexClaw Different

|                      | OpenClaw                    | NexClaw                                              |
| -------------------- | --------------------------- | ---------------------------------------------------- |
| **Scope**            | Personal AI assistant       | AI-powered virtual workforce                         |
| **Interface**        | CLI + messaging channels    | Mission Control web dashboard + CLI + channels       |
| **Agent Model**      | Single conversational agent | Multi-specialist agent teams with task decomposition |
| **Task Management**  | Chat-based                  | 5-column Kanban board with real-time SSE streaming   |
| **Content Creation** | Via conversation            | 7-tool content factory across 10 platforms           |
| **Memory**           | File-backed + vector search | + NotebookLM long-term business knowledge store      |
| **CLI Backends**     | Anthropic API               | Claude Code CLI + OpenAI Codex CLI + direct API      |
| **Safety**           | Per-message                 | Budget enforcement + approval gates + env isolation  |
| **Desktop**          | Terminal                    | Electron app with auto-service management            |

---

## Dev Profile vs Default Profile

NexClaw uses a `--dev` flag to isolate your development configuration, auth credentials, and agent state in `~/.openclaw-dev/` — completely separate from the default OpenClaw profile at `~/.openclaw/`.

| Flag                          | State Directory    | Config File                     |
| ----------------------------- | ------------------ | ------------------------------- |
| `nexclaw --dev <command>`     | `~/.openclaw-dev/` | `~/.openclaw-dev/openclaw.json` |
| `nexclaw <command>` (no flag) | `~/.openclaw/`     | `~/.openclaw/openclaw.json`     |

**All commands in this README use `--dev`.** This is intentional — it keeps your NexClaw dev environment isolated so upstream syncs, branch switches, and rebases never touch your credentials or agent configs.

To run against the default OpenClaw profile instead, simply omit `--dev` from any command.

> **Important:** The `--dev` flag goes before the subcommand: `nexclaw --dev onboard`, not `nexclaw onboard --dev`.

---

## Key Features

### Mission Control Dashboard

A real-time web interface for managing your virtual workforce.

- **AI Chat with Intent Classification** — Natural language input that automatically routes between casual conversation and task dispatch. Inline cards for task confirmation, intent clarification, and team suggestions.
- **5-Column Kanban Board** — Drag-and-drop task management (Backlog > Todo > In Progress > Review > Done) with live SSE updates, color-coded priority badges, subtask progress bars, and real-time agent count indicators.
- **CoWork Sessions** — Launch a full Claude Code agent session scoped to any local project with live streaming output, configurable permission modes, budget limits, and MCP server management.
- **Cost Dashboard** — Financial analytics with date-range filtering, daily spend charts, per-task cost breakdown, and token usage tracking.
- **Workspace Tools** — Launch, monitor, and cancel Python/Node tools from a visual grid with live streaming output panels and concurrency management.
- **Guided Onboarding** — 5-step animated wizard that configures your business profile, team composition, and gateway connection.
- **Mobile-Optimized** — Swipeable task cards, pull-to-refresh, bottom sheet task details, and adaptive sidebar/tab-bar layout.
- **Electron Desktop App** — Packaged desktop application with auto-spawned services, port conflict resolution, and native folder picker.

### Agent Team Orchestration

The dispatch engine that powers NexClaw's virtual workforce.

- **LLM-Powered Task Decomposition** — Submit a plain-English goal and the system automatically breaks it into specialist subtasks categorized by business domain, with memory-enriched context from past tasks.
- **Skill Registry with Hot Reload** — A filesystem-based plugin system that indexes `SKILL.md` files and auto-rescans on change. Drop a skill file and it's immediately available to the dispatch engine.
- **Intelligent Team Assembly** — Maps subtasks to the best-matching skills and team members via domain-overlap scoring, with pre-execution cost estimates before any work begins.
- **Budget Enforcement** — Per-task and monthly spend caps checked before agent launch. Prevents runaway costs with clear human-readable errors.
- **Approval Gate** — Human-in-the-loop checkpoints for sensitive operations. Agents pause and wait for explicit approval before proceeding.
- **Persistent Task Queue** — Serialized to disk so in-flight work survives gateway restarts. Automatic stuck-task detection with configurable timeouts.

### Multi-Provider CLI Backend Architecture

Use any AI provider as your workforce's brain — switch with a single config change.

- **Claude Code CLI** — Spawn Claude Code as a subprocess with session resume, model aliases (opus/sonnet/haiku), and secure environment isolation.
- **OpenAI Codex CLI** — Full integration with JSONL output parsing, resume support, and sandbox mode. Authenticate via `nexclaw --dev onboard --auth-choice openai-codex`.
- **Custom Backends** — Register any CLI tool as a named backend in config. No code changes required.
- **Lane-Based Queue Isolation** — Sub-agents run in their own execution lanes so they don't block the main conversation queue.
- **Adaptive Watchdog** — No-output timeout monitoring with configurable thresholds for fresh vs. resume sessions, plus structured failover error classification.
- **20+ Auth Providers** — Anthropic, OpenAI, Google Gemini, GitHub Copilot, xAI Grok, OpenRouter, Together AI, and more — all via a guided onboard wizard.

### Long-Term Memory & Business Knowledge

Your workforce remembers and learns.

- **NotebookLM Integration** — Persists task outcomes, learned patterns, and business context to a Google NotebookLM notebook. Queries this knowledge store to enrich future task decompositions with relevant past experience. Gracefully degrades when unavailable.
- **NotebookLM Business Knowledge MCP Server** — Six business-focused tools (`business_knowledge_query`, `_add`, `_add_document`, `_list_sources`, `_init`, `_stats`) with category-tagged sources and rate-limit tracking.
- **LanceDB Vector Memory** — Auto-recall of the top-3 semantically relevant memories injected into every conversation, with prompt-injection detection and GDPR-compliant selective deletion.
- **File-Backed Memory** — Lightweight persistent memory via the core plugin, exposed as a `nexclaw memory` CLI command.

### Content Factory

A 7-tool AI-powered content marketing pipeline.

| Tool                   | What It Does                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Reddit Scout**       | Multi-mode intelligence (pain points, market signals, general sentiment) with LLM-planned search across 15-25 subreddits |
| **X/Twitter Scout**    | Lead discovery, trend analysis, and competitor intelligence via RapidAPI + Brave fallback                                |
| **Trend Scout**        | AI automation trend discovery via Brave Search with Grok fallback, outputs structured `trends.json`                      |
| **Content Drafter**    | Generates platform-optimized drafts for 10 platforms with embedded visual markers and YAML metadata                      |
| **Social Alchemist**   | Single-call 10-platform campaign bundle from any text/file/URL, with AI-updatable playbook                               |
| **Visual Artist**      | Gemini 3 Pro image generation at 1K/2K/4K resolution, integrates with draft visual markers                               |
| **YouTube Strategist** | Outlier video analysis (views/subs >= 3x), title psychology, hook scripts, and structured outlines                       |

### 14 Messaging Channels (from OpenClaw)

Connect your workforce to the platforms your customers use.

Telegram | Discord | Slack | WhatsApp | Signal | Matrix | Microsoft Teams | iMessage | IRC | LINE | Feishu/Lark | Zalo | Nostr | Twitch

### Industry Domain Skills

Pre-built specialist skill packs loaded automatically by the dispatch engine.

- **IT Consultancy** — Project reporting, proposal writing, technical documentation, billing, client communications
- **E-Commerce** — Product management, marketing copy, order handling, customer support, sales analytics

Custom domain skills are added by dropping a `SKILL.md` file into the skill registry directory.

---

## Quick Start

### Prerequisites

- Node.js >= 22.12.0
- pnpm >= 10.23.0
- Python 3 (for content factory tools)

### Setup

```bash
# Clone and install
git clone https://github.com/beetz12/openclaw.git nexclaw
cd nexclaw
pnpm install

# Configure (creates ~/.openclaw-dev/openclaw.json)
bash scripts/setup-dev.sh

# Authenticate with your AI provider (--dev targets ~/.openclaw-dev/)
nexclaw --dev onboard --auth-choice openai-codex    # ChatGPT Plus/Pro
# or
nexclaw --dev models auth setup-token --provider anthropic  # Claude

# Build
pnpm build

# Validate environment
pnpm vwp:check
```

### Launch

```bash
# Start Mission Control (gateway + web dashboard)
pnpm vwp:start

# Open the dashboard
open http://localhost:3000
```

### Switch Models

Edit `~/.openclaw-dev/openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai-codex/gpt-5.3-codex"
      }
    }
  }
}
```

Available providers: `openai-codex/gpt-5.3-codex` | `claude-cli/opus` | `claude-cli/sonnet`

Restart the gateway after changing.

---

## NexClaw Setup

### Gateway Service Management

The dev gateway runs as a launchd service under the `ai.openclaw.dev` label, using your config at `~/.openclaw-dev/openclaw.json` on port 19001.

```bash
# Install the gateway service (creates ~/Library/LaunchAgents/ai.openclaw.dev.plist)
nexclaw --dev gateway install --force

# Start manually (foreground, Ctrl+C to stop)
nexclaw --dev gateway

# Restart the background service
nexclaw --dev gateway restart

# Stop the background service
nexclaw --dev gateway stop

# Reinstall after code changes
nexclaw --dev gateway install --force

# Set a config value
nexclaw --dev config set <path> <value> --json
```

> **Important:** Always use `nexclaw --dev` (before the subcommand) so it targets the correct profile, config, and launchd label. Running `nexclaw gateway restart` (without `--dev`) targets the default profile (`ai.openclaw.gateway`) which is a different service.

### Logs

```bash
# Gateway stdout
tail -f ~/.openclaw-dev/logs/gateway.log

# Gateway stderr
tail -f ~/.openclaw-dev/logs/gateway.err.log
```

---

## Architecture

```
User
  |
  v
Mission Control (localhost:3000)          Electron Desktop App
  |  Next.js 15 / React 19                  |  Auto-spawned services
  |  SSE real-time streaming (34 events)     |  Native folder picker
  |                                          |
  +------------------------------------------+
  |
  v
NexClaw Gateway (localhost:18789)
  |
  +-- VWP Dispatch Plugin
  |     |-- Task Decomposition (LLM-powered)
  |     |-- Skill Registry (hot reload)
  |     |-- Team Assembly (cost estimates)
  |     |-- Budget Enforcement
  |     |-- Approval Gate
  |     +-- Agent Launcher --> CLI Backends
  |                              |-- Claude Code CLI
  |                              |-- OpenAI Codex CLI
  |                              +-- Custom backends
  |
  +-- VWP Approval Plugin
  |     |-- Message interception (all channels)
  |     +-- SQLite review queue
  |
  +-- Memory Layer
  |     |-- NotebookLM (business knowledge)
  |     |-- LanceDB (vector memory)
  |     +-- File-backed (core)
  |
  +-- 14 Messaging Channels
  |     Telegram | Discord | Slack | WhatsApp | ...
  |
  +-- Content Factory (Python tools)
        Reddit Scout | X Scout | Trend Scout
        Content Drafter | Social Alchemist
        Visual Artist | YouTube Strategist
```

---

## Project Structure

```
apps/
  vwp-board/            # Mission Control (Next.js 15)
  vwp-desktop/          # Electron desktop wrapper
extensions/
  vwp-dispatch/         # Core: task dispatch + agent teams
  vwp-approval/         # Human review queue (SQLite)
  vwp-dashboard/        # Mobile-first Lit PWA dashboard
  vwp-consulting/       # IT consultancy domain skills
  vwp-ecommerce/        # E-commerce domain skills
  memory-lancedb/       # Vector memory plugin
  memory-core/          # File-backed memory plugin
  telegram/             # Telegram channel (+ 13 more)
tools/
  content-suite/        # Python content marketing pipeline
vwp-mcp-tools/
  notebooklm-memory-mcp/  # NotebookLM MCP server
packages/
  vwp-theme/            # Shared design tokens
scripts/
  setup-dev.sh          # Dev environment setup
  rebase-upstream.sh    # Upstream merge helper
  vwp-check.mjs         # Environment validator
  start-vwp.sh          # Launch full stack
  stop-vwp.sh           # Stop full stack
```

---

## Upstream Sync

NexClaw is kept in sync with the official [OpenClaw repository](https://github.com/openclaw/openclaw). Every upstream feature, security fix, and improvement is available here.

```bash
# Pull latest upstream changes
bash scripts/rebase-upstream.sh

# Or use the skill
/openclaw-upstream-sync
```

The fork maintains a minimal diff surface (~45 lines across ~14 files) with automated CI monitoring, security regression tests, and a centralized import barrel to make merges predictable and safe.

---

## Running Tests

```bash
pnpm test                                    # All unit tests
pnpm vitest run extensions/vwp-dispatch/     # Dispatch tests
pnpm vitest run extensions/vwp-dispatch/fork-invariants.test.ts  # Security invariants
cd apps/vwp-board && pnpm test:e2e           # Board E2E tests
```

---

## Beads Workflow

This project uses [Beads](https://github.com/steveyegge/beads) (`bd`) for persistent issue tracking and cross-session memory.

### Quick Start

```bash
bd ready              # See what's ready to work on
bd show <id>          # View full task details
bd update <id> --claim  # Claim a task before starting
bd close <id>         # Close when done
bd sync               # Persist to git
```

### Available Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| **Plan a Feature** | `/feature-to-beads` | Analyze requirements, draft implementation plan, save as epic with linked tasks |
| **Execute Next Task** | `/beads-execute` | Pick up highest-priority ready task, execute via agent team, verify, close |
| **Save Session Context** | `/session-to-beads` | Capture remaining work, bugs, and decisions before ending session |
| **Project Setup** | `/beads-project-setup` | Initialize Beads in a new project |

### Workflow

```text
  /feature-to-beads  -> plan a feature into TASKS.md and Beads issues
  /beads-execute     -> work the next ready issue
  /session-to-beads  -> persist remaining context before ending a session
```

### Key Commands

| Command | What It Does |
|---------|-------------|
| `bd ready --json` | List unblocked tasks by priority |
| `bd show <id>` | Full task details with dependencies |
| `bd create "title" -t task -p 2 -d "desc" --json` | Create a new task |
| `bd update <id> --claim` | Atomically assign + mark in-progress |
| `bd close <id> --reason "done"` | Complete a task |
| `bd dep add <child> <parent>` | Link a dependency |
| `bd epic <id>` | View an epic and its tasks |
| `bd search "query"` | Full-text search across all issues |
| `bd doctor` | Health check |
| `bd sync` | Sync Beads state |

---

## Acknowledgments

NexClaw is built on the extraordinary work of the [OpenClaw](https://github.com/openclaw/openclaw) project and its contributors. We are grateful for the foundation that makes this possible.

---

<p align="center">
  <strong>Built by <a href="https://nexaiadvisors.com">NexAI Advisors</a></strong><br>
  <em>AI strategy, implementation, and workforce automation for forward-thinking businesses.</em>
</p>
