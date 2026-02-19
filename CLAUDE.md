# OpenClaw Project Guidelines

## First-time Setup

1. Install dependencies: `pnpm install`
2. Run setup script: `bash scripts/setup-dev.sh`
   - Creates `~/.openclaw-dev/openclaw.json` with default VWP config
   - Sets `agents.defaults.model.primary` to `"claude-cli/opus"` for CLI backend mode
3. Build: `pnpm build`
4. Validate environment: `pnpm vwp:check`
5. Run tests: `pnpm check && pnpm test`

Without the config file, the system falls back to the embedded Pi runner instead of spawning Claude Code as a subprocess. There is no warning — behavior silently changes.

## Upstream Merge Workflow

To pull latest changes from the upstream openclaw repo:

```
bash scripts/rebase-upstream.sh
```

Or manually:
```
git fetch upstream
git rebase upstream/main
pnpm install && pnpm build && pnpm check && pnpm test
```

Expected conflict files (resolve by keeping nexclaw values):
- `src/cli/cli-name.ts` — CLI rename
- `src/entry.ts` — process.title, error strings
- `package.json` — bin field, script names
- `src/agents/cli-runner.ts` — lane parameter, clearEnv fix
- `src/agents/cli-backends.ts` — CLAUDECODE in clearEnv

## CLI Backend Integration

### Environment Variable Isolation
- When spawning CLI subprocesses (Claude Code, Codex), set cleared env vars to `undefined` instead of using `delete` — the exec layer in `src/process/exec.ts:103` re-merges `process.env`, which restores deleted keys.
- The `clearEnv` array in `src/agents/cli-backends.ts` must include `CLAUDECODE` to prevent nested session detection errors.
- `CLAUDECODE` is already included in the hardcoded default at `src/agents/cli-backends.ts:51`. You do NOT need to add it to your config file.
- The `mergeBackendConfig` function uses union semantics for `clearEnv`: config can ADD keys but never REMOVE keys from the hardcoded base. This is a security invariant.
- If nested session detection fails, the error comes from Claude Code itself (not nexclaw). Look for "session already active" or similar — this indicates `CLAUDECODE` was not cleared.
- Key files: `src/agents/cli-runner.ts` (env construction), `src/process/exec.ts` (env merge + filter), `src/agents/cli-backends.ts` (clearEnv config).

### SSE Event Registration
- Every new SSE event type must be added in TWO places:
  1. Backend: `extensions/vwp-dispatch/kanban-types.ts` (type union) + the emitting handler
  2. Frontend: `apps/vwp-board/src/lib/sse-client.ts` (eventTypes array at ~line 86)
- Missing from either side silently drops the event with no error or warning.

## E2E Testing

### Browser Auth Token for Backend API Calls
- The vwp-board frontend reads its auth token from localStorage key `vwp-dashboard-token`. Playwright E2E tests that exercise frontend-to-backend flows (e.g., onboarding completion, team preview) must inject this token via `page.evaluate()` in `beforeEach`.
- Without the token, frontend API calls silently fail (caught errors) and the UI falls through to fallback behavior — tests appear to pass but backend-dependent features are never tested.
- Do: Inject token, reset backend state via the `request` fixture, and navigate after injection.
- Don't: Assume the browser has any auth state — Playwright starts with a clean profile.
- Also reset backend state (e.g., `DELETE /vwp/onboarding`) before tests that create server-side resources, to avoid stale data from previous runs.

### Gateway Restart After Handler Registration
- When new HTTP handlers are added to `extensions/vwp-dispatch/index.ts`, the gateway process must be restarted to load them. A running gateway will return 404/405 for newly registered routes until restarted.
- The start script (`pnpm vwp:start`) may fail if a stale gateway process holds the port. Use `lsof -ti:19001 | xargs kill -9` then retry.

## Architecture Notes

### Gateway Chat Routing Chain
`chat.send` RPC -> `dispatchInboundMessage()` -> `dispatchReplyFromConfig()` -> `getReplyFromConfig()` -> `runPreparedReply()` -> `runReplyAgent()` -> `runAgentTurnWithFallback()` -> `isCliProvider()` check -> `runCliAgent()` or `runEmbeddedPiAgent()`

### Model Resolution Priority
1. Agent-specific: `agents.list[n].model`
2. Global default: `agents.defaults.model.primary`
3. Built-in fallback: `anthropic/claude-opus-4-6`

### CLI Backend Detection
- `isCliProvider()` in `src/agents/model-selection.ts` returns true for `claude-cli` and `codex-cli` providers
- Config: `agents.defaults.model.primary: "claude-cli/opus"` in `~/.openclaw-dev/openclaw.json`

### CLI Binary Name
- The CLI binary was renamed from `openclaw` to `nexclaw` (binary-only rename with backward compat).
- Both `nexclaw` and `openclaw` work as commands; `nexclaw` is the primary/canonical name.
- From dev: `pnpm nexclaw` (or `node scripts/run-node.mjs`).
- Key files: `src/cli/cli-name.ts` (DEFAULT_CLI_NAME), `src/entry.ts` (process.title), `package.json` (bin field).
- `OPENCLAW_*` env vars are unchanged — only the binary name was renamed, not env var prefixes.
- Help text and error examples showing `OPENCLAW_*` env vars are intentional — these are the actual variable names, not a display bug. `NEXCLAW_*` variants do NOT exist.
- `CLAWDBOT_*` env vars (seen in some scripts) are a legacy namespace alias. They function identically to their `OPENCLAW_*` counterparts.

### OpenAI Codex OAuth
- To configure OpenAI Codex auth, use the **onboard wizard**: `nexclaw onboard --auth-choice openai-codex`
- Do NOT use `nexclaw models auth login --provider openai-codex` — that command only finds plugin-registered providers, and openai-codex is a built-in auth choice, not a plugin.
- The auth choice list is in `src/commands/auth-choice-options.ts`; the OAuth implementation is in `src/commands/openai-codex-oauth.ts`.
- After auth, configure model: `agents.defaults.model.primary: "openai-codex/gpt-5.3-codex"`
