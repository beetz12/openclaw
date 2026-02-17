# OpenClaw — Setup & Run Guide

This guide covers how to install, build, configure, and run the custom OpenClaw project from source, including the VWP (Virtual Workforce Platform) extensions.

---

## Prerequisites

- **Node.js** >= 22.12.0
- **pnpm** >= 10.23.0 (preferred), or npm/bun
- **Python 3** (for workspace tools like content-suite)
- At least one model provider API key (Anthropic recommended)

---

## 1. Clone & Install

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
```

---

## 2. Build

```bash
pnpm ui:build       # Build UI (auto-installs UI deps on first run)
pnpm build           # Full build: canvas, TypeScript, plugin SDK, CLI compat
```

Additional build commands:

```bash
pnpm build:plugin-sdk:dts   # Generate TypeScript definitions for plugin SDK
pnpm canvas:a2ui:bundle     # Bundle Canvas A2UI components
```

---

## 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings. Env-source precedence (highest to lowest): process env, `./.env`, `~/.openclaw/.env`, then `openclaw.json` env block.

### Required

```bash
# Gateway auth token (recommended if binding beyond loopback)
OPENCLAW_GATEWAY_TOKEN=<generate with: openssl rand -hex 32>

# At least one model provider API key
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...
```

### Optional — Channels

```bash
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
DISCORD_BOT_TOKEN=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
MATTERMOST_BOT_TOKEN=...
MATTERMOST_URL=https://chat.example.com
ZALO_BOT_TOKEN=...
```

### Optional — Tools & Voice

```bash
BRAVE_API_KEY=...
PERPLEXITY_API_KEY=pplx-...
FIRECRAWL_API_KEY=...
ELEVENLABS_API_KEY=...
DEEPGRAM_API_KEY=...
```

### Optional — Workspace Tools (Content Suite)

```bash
REDDIT_CLIENT_ID=...
REDDIT_SECRET=...
REDDIT_USER_AGENT=...
RAPIDAPI_KEY=...
```

---

## 4. Run the Gateway (Development)

```bash
# Dev mode with auto-reload (recommended for development)
pnpm gateway:watch

# Or standard dev mode
pnpm dev

# Or run gateway directly with flags
pnpm gateway:dev    # Skips channel loading for faster startup
```

The gateway starts on `http://localhost:18789` by default.

---

## 5. Run the VWP Board (Mission Control UI)

The VWP Board is a Next.js 15 / React 19 web app with Kanban task management, agent monitoring, cost tracking, and workspace tools.

```bash
cd apps/vwp-board
pnpm dev
```

Opens at `http://localhost:3000`. Features:

- **Kanban Board** — drag-and-drop task management
- **Agent Panel** — real-time agent monitoring (slide-over desktop / bottom sheet mobile)
- **Workspace Tools** — launch, monitor, cancel Python tools from the UI
- **Cost Dashboard** — budget tracking and spend monitoring
- **Goal Input** — submit tasks to the VWP dispatch system
- **Onboarding** — guided setup flow

---

## 6. Run the VWP Dashboard (Lit Components UI)

The VWP Dashboard is a mobile-first Lit web components approval interface.

```bash
cd extensions/vwp-dashboard
pnpm dev
```

Opens at `http://localhost:5173`. Features:

- **Home View** — overview with task stats
- **Queue View** — message approval queue
- **Tasks View** — task management
- **Business View** — business metrics
- **Responsive** — works on desktop (1920px) and mobile (375px)

---

## 7. Install Workspace Tools (Python)

The content-suite tools (Reddit Scout, X Scout, Trend Scout, Social Alchemist, Content Drafter) require Python dependencies:

```bash
cd tools/content-suite
pip install -r requirements.txt
```

These tools are managed through the VWP Board's `/tools` page and execute as sandboxed subprocesses via the ToolRunner.

---

## 8. Production Installation

### Via npm (recommended)

```bash
npm install -g openclaw@latest
# or: pnpm add -g openclaw@latest

# Run the onboard wizard — installs daemon, guides through setup
openclaw onboard --install-daemon
```

The wizard installs the Gateway as a daemon (launchd on macOS, systemd on Linux) so it stays running in the background.

### Run gateway manually

```bash
openclaw gateway --port 18789 --verbose
```

### Send a message

```bash
openclaw message send --to +1234567890 --message "Hello from OpenClaw"
```

### Talk to the assistant

```bash
openclaw agent --message "Ship checklist" --thinking high
```

### Health check

```bash
openclaw doctor
```

---

## 9. Docker

```bash
# Ensure .env is configured, then:
docker compose up openclaw-gateway
```

Services:

| Service            | Port  | Purpose                     |
| ------------------ | ----- | --------------------------- |
| `openclaw-gateway` | 18789 | Main gateway                |
| `openclaw-gateway` | 18790 | Bridge                      |
| `openclaw-cli`     | —     | Interactive CLI (stdin/tty) |

Volumes mount `~/.openclaw` for config and workspace persistence.

---

## 10. Running Tests

### Unit Tests

```bash
pnpm test              # All unit tests (Vitest)
pnpm test:fast         # Quick unit tests
pnpm test:watch        # Interactive watch mode
pnpm test:coverage     # With v8 coverage report (70% threshold)
```

### E2E Tests

```bash
pnpm test:e2e          # All end-to-end tests

# Board-specific E2E
cd apps/vwp-board
pnpm test:e2e          # Headless
pnpm test:e2e:headed   # With browser visible

# Dashboard-specific E2E
cd extensions/vwp-dashboard
npx playwright test
```

### Extension Tests

```bash
# All dispatch extension tests
pnpm vitest run extensions/vwp-dispatch/

# Specific test file
pnpm vitest run extensions/vwp-dispatch/tool-routes.test.ts
```

### Live API Tests

```bash
# Requires real API keys in .env
pnpm test:live
```

### Docker Integration Tests

```bash
pnpm test:docker:all
```

### Linting & Formatting

```bash
pnpm check             # Lint + format check (Oxlint + Oxfmt)
pnpm lint:fix          # Auto-fix lint errors
pnpm format            # Auto-format code
pnpm format:check      # Check formatting only
```

---

## Project Structure

```
openclaw/
├── apps/
│   ├── vwp-board/          # Next.js 15 Mission Control dashboard
│   ├── ios/                # iOS companion app (Swift)
│   ├── android/            # Android companion app (Kotlin)
│   ├── macos/              # macOS menu bar app (Swift)
│   └── shared/             # Shared native code (OpenClawKit)
├── extensions/
│   ├── vwp-dispatch/       # Task dispatch & agent team execution
│   ├── vwp-approval/       # SSE-based approval queue
│   ├── vwp-dashboard/      # Lit web components dashboard
│   ├── vwp-consulting/     # IT consultancy domain skills
│   ├── vwp-ecommerce/      # E-commerce domain skills
│   ├── discord/            # Discord channel
│   ├── slack/              # Slack channel
│   ├── telegram/           # Telegram channel
│   ├── ...                 # 17+ channel extensions
│   ├── memory-core/        # Base memory system
│   ├── memory-lancedb/     # Vector DB memory backend
│   └── lobster/            # Typed workflow engine
├── packages/
│   ├── vwp-theme/          # Shared Tailwind CSS 4 design tokens
│   ├── clawdbot/           # Bot framework
│   └── moltbot/            # Message handling bot
├── src/                    # Core platform source
│   ├── agents/             # Agent orchestration (338 files)
│   ├── gateway/            # HTTP gateway server
│   ├── channels/           # Channel abstraction layer
│   ├── config/             # Configuration types & defaults
│   ├── commands/           # CLI commands
│   ├── memory/             # Memory subsystem
│   ├── plugins/            # Plugin runtime
│   └── infra/              # System infrastructure
├── tools/
│   └── content-suite/      # Python workspace tools
├── knowledge-work-plugins/ # 11 domain plugins
├── docs/                   # Documentation
│   └── plans/              # Implementation plans
├── docker-compose.yml      # Docker orchestration
├── .env.example            # Environment template
└── package.json            # Root package (scripts, deps)
```

---

## Key URLs

| Service       | URL                        | Notes                  |
| ------------- | -------------------------- | ---------------------- |
| Gateway       | `http://localhost:18789`   | Main API + WebSocket   |
| Bridge        | `http://localhost:18790`   | Channel bridge         |
| VWP Board     | `http://localhost:3000`    | Mission Control UI     |
| VWP Dashboard | `http://localhost:5173`    | Approval dashboard     |
| Docs          | `https://docs.openclaw.ai` | Official documentation |
| Discord       | `https://discord.gg/clawd` | Community              |
