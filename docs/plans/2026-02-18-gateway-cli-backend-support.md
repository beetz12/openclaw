# Gateway CLI Backend Support

**Status:** APPROVED (Multi-Agent Brainstorming Review)
**Date:** 2026-02-18
**Confidence:** HIGH (85%)
**Reviewers:** Skeptic, Constraint Guardian, User Advocate, Arbiter

---

## Problem

The gateway's embedded agent runner (`runEmbeddedPiAgent`) requires direct API keys in `auth-profiles.json` or `ANTHROPIC_API_KEY` env var. Users with Claude Max plans or Codex OAuth authenticate via their CLI session, not API keys. The gateway currently can't leverage that auth path, causing all agent interactions (chat, heartbeat) to fail with "No API key found for provider anthropic."

## Solution

Enable the gateway to route all agent interactions through the `claude` or `codex` CLI subprocess instead of the embedded runner. The routing already exists in `runWithModelFallback()` via `isCliProvider()` — this design adds the UX polish and reliability enhancements needed for production chat use.

## Non-Goals

- Runtime backend switching from the UI (config-time only)
- Modifying the embedded runner's behavior
- Adding new CLI commands or auth flows
- Real-time token streaming for CLI backends (future enhancement)
- Multi-user/multi-tenant support

---

## Configuration

Set in `~/.openclaw-dev/openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "claude-cli/opus"
      }
    }
  }
}
```

The existing `isCliProvider()` function in `src/agents/model-selection.ts` recognizes `claude-cli` and `codex-cli` as CLI providers and routes to `runCliAgent()` instead of `runEmbeddedPiAgent()`.

Model aliases: `opus` → `claude-opus-4-6`, `sonnet` → `claude-sonnet-4-5`, `haiku` → `claude-haiku-4-5`.

No new config keys are needed.

---

## Architecture

### Startup Validation

On `gateway_start` event, the dispatch plugin:

1. Resolves configured model ref from config to determine provider
2. Checks `isCliProvider()` to detect CLI mode
3. If CLI mode:
   - Verifies CLI binary exists via Node `fs.access()` on PATH
   - Logs warning: `"vwp-dispatch: CLI backend active — subprocess runs with --dangerously-skip-permissions"`
   - Stores backend type for status endpoint
4. Emits enhanced `gateway_status` SSE: `{ type: "gateway_status", connected: true, backendType: "cli" | "embedded" }`

### Chat Flow (CLI Backend)

1. User sends message via `POST /vwp/chat/send`
2. Dispatch plugin proxies to `gateway.call("chat.send", ...)`
3. Dispatch starts `setInterval(5000)` emitting `chat_thinking` SSE events:
   - First: `{ type: "chat_thinking", messageId, status: "processing", elapsed_ms: 0 }`
   - Every 5s: `{ type: "chat_thinking", messageId, status: "processing", elapsed_ms: N }`
   - If queued: `{ type: "chat_thinking", messageId, status: "queued", position: N }`
4. Gateway routes through `runWithModelFallback()` → `isCliProvider()` → `runCliAgent()`
5. CLI subprocess executes (5-60s typical, 120s max)
6. Gateway broadcasts final text via "chat" event channel
7. Dispatch clears interval, emits `chat_message` SSE event
8. On first CLI chat per session: emit system message explaining tool limitations

### Chat Timeout

Backend-aware timeouts replace the hardcoded 15s in `chat-routes.ts`:

| Backend  | Timeout                                                        |
| -------- | -------------------------------------------------------------- |
| CLI      | 120s (from `config.agents.defaults.timeoutSeconds` or default) |
| Embedded | 15s                                                            |

Timeout is resolved at startup, not per-request.

### Cancel Mechanism

`POST /vwp/chat/cancel` → `gateway.call("chat.cancel", { runId })` → gateway kills CLI subprocess via SIGTERM. The dispatch plugin clears the thinking interval and emits:

```json
{
  "type": "chat_message",
  "messageId": "...",
  "role": "system",
  "content": "Request cancelled.",
  "done": true
}
```

### Queue Isolation

New `lane` parameter on `runCliAgent()`:

```typescript
export async function runCliAgent(params: {
  // ... existing params ...
  lane?: string; // NEW: queue isolation key
}): Promise<EmbeddedPiRunResult>;
```

Queue key: `${backendId}:${lane}` (e.g., `claude-cli:chat` vs `claude-cli:dispatch`).

This prevents chat from blocking behind analyzer/team-launcher runs.

### Session Management (Hybrid)

- **CLI manages AI context**: Uses `--session-id` for conversation continuity, context compaction, tool history
- **Gateway manages UI display**: `ServerChatStore` persists messages to JSONL for Mission Control display
- **Loosely coupled**: These serve different consumers (model vs human). Divergence is expected and acceptable.

If CLI session corrupts, gateway can bootstrap a new one. If JSONL corrupts, CLI session continues unaffected.

### Heartbeat

Lightweight `cli --version` check instead of full agent call:

- Runs on startup + every 30 minutes
- Validates binary is available and responsive
- On success: emit `gateway_status: { connected: true }`
- On failure: emit `gateway_status: { connected: false, error: "CLI unavailable" }`
- Does NOT replace the full agent heartbeat — that capability is preserved in the embedded path

### Error Translation

New `cli-error-translator.ts` maps subprocess errors:

| CLI Error                    | User Message                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| ENOENT (binary not found)    | "Claude CLI is not installed. Visit https://docs.anthropic.com/claude-code to install." |
| Auth expired / not logged in | "Claude CLI session expired. Run `claude login` to re-authenticate."                    |
| Rate limit                   | "Rate limit reached. Please wait a moment and try again."                               |
| Timeout (120s)               | "Response timed out. The request may have been too complex."                            |
| Permission denied            | "Claude CLI needs permissions. Run `claude` in terminal first."                         |
| Generic error                | "Agent error: [sanitized message]"                                                      |

Emitted as `chat_message` with `error: true` flag for error styling in frontend.

### No Cross-Boundary Fallback

When CLI is configured as primary, fallback chain should only include other CLI models. No silent switch to embedded backend — this would fail without API keys and confuse users with context loss.

---

## Files Changed

### New Files

| File                                              | Purpose                                             |
| ------------------------------------------------- | --------------------------------------------------- |
| `extensions/vwp-dispatch/cli-error-translator.ts` | Map CLI subprocess errors to user-friendly messages |
| `extensions/vwp-dispatch/cli-health-check.ts`     | Lightweight CLI binary health check                 |

### Modified Files

| File                                                | Change                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `extensions/vwp-dispatch/index.ts`                  | Startup CLI detection, security warning, store backend type              |
| `extensions/vwp-dispatch/chat-routes.ts`            | Backend-aware timeout, thinking events, cancel endpoint, enhanced status |
| `extensions/vwp-dispatch/kanban-types.ts`           | Add `chat_thinking` event type, `error` flag on `chat_message`           |
| `apps/vwp-board/src/store/chat-store.ts`            | Handle `chat_thinking`, cancel, and queue events                         |
| `apps/vwp-board/src/components/chat/ChatStream.tsx` | "Thinking... (Ns)" UI, cancel button                                     |
| `apps/vwp-board/src/types/kanban.ts`                | Add `chat_thinking` event type                                           |
| `src/agents/cli-runner.ts`                          | Add optional `lane` parameter for queue isolation                        |

### NOT Modified

| File                              | Reason                                      |
| --------------------------------- | ------------------------------------------- |
| `src/gateway/` (all)              | Routing already works via `isCliProvider()` |
| `src/auto-reply/` (all)           | Embedded runner path unchanged              |
| `src/agents/cli-backends.ts`      | Default configs are correct as-is           |
| Existing embedded runner behavior | Fully preserved                             |

---

## Security Notes

- CLI backend uses `--dangerously-skip-permissions` flag (pre-existing in `cli-backends.ts`)
- Subprocess inherits user's UID — same security context as terminal usage
- `clearEnv` removes `ANTHROPIC_API_KEY` from subprocess environment
- System prompt passed via CLI args is visible in `ps` output (pre-existing, low severity for single-user)
- Single-user/small-team deployment only — no multi-tenant support

---

## Decision Log

| #   | Decision                              | Alternatives Considered                | Rationale                                             |
| --- | ------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| D1  | Config-time backend selection only    | Runtime switching, UI dropdown         | Simpler, user edits one JSON field                    |
| D2  | Streaming nice-to-have, not required  | Required streaming                     | CLI doesn't stream; Thinking indicator acceptable     |
| D3  | Hybrid session management             | CLI-only, Gateway-only                 | Different consumers (model vs human), loosely coupled |
| D4  | Error-only on failure (no fallback)   | Configurable fallback, always fallback | Would fail without API keys; confuses user            |
| D5  | Approach 2: Enhanced CLI path         | Config-only (A1), Full rewrite (A3)    | Existing routing works; add UX polish                 |
| D6  | Use existing config schema            | New config keys                        | model.primary + isCliProvider() handles routing       |
| D7  | Lightweight CLI health check          | Full agent heartbeat                   | cli --version is fast; no API call needed             |
| D8  | Error translation layer               | Raw errors                             | User-friendly messages for common failures            |
| D9  | Backend-aware chat timeout            | Hardcoded 15s                          | CLI: 120s, Embedded: 15s                              |
| D10 | Separate CLI queue namespaces         | Shared queue                           | Prevent chat blocking behind dispatch                 |
| D11 | chat_thinking is new SSE event type   | Reuse existing types                   | Clean separation of concerns                          |
| D12 | Heartbeat interval in dispatch plugin | In CLI runner                          | setInterval in chat-routes.ts, cleared on response    |
| D13 | Lane parameter on runCliAgent()       | Separate queues                        | Queue key = backendId:lane. Minimal signature change. |
| D14 | Timeout set at startup, backend-aware | Per-request                            | Simpler, predictable                                  |
| D15 | Log security warning on CLI startup   | Silent                                 | Users should know about skip-permissions              |
| D16 | System message on first CLI chat      | Silent tool disable                    | Users need to know tool limitations                   |
| D17 | Elapsed time in thinking events       | Generic heartbeats                     | Better UX feedback                                    |
| D18 | Cancel mechanism for CLI requests     | No cancel                              | Users need escape hatch for long waits                |
| D19 | Queue position indicator              | No position info                       | Transparency for serialized requests                  |
| D20 | No cross-boundary fallback            | Allow mixed                            | Prevents confusion from context loss                  |
| D21 | Installation URL in error message     | Generic "not found"                    | Actionable error for missing CLI                      |

---

## Review Summary

### Skeptic Findings (6 accepted, 5 acknowledged)

- 15s timeout false-positive → D9
- chat_thinking is new work → D11
- Serialization bottleneck → D10, D13
- Heartbeat emitter unclear → D12
- cli-error-translator is new → D8
- Heartbeat --version scope change → D7 (documented)

### Constraint Guardian Findings (3 blocking resolved, 4 advisory)

- Queue HOL blocking → D13 (lane parameter)
- Hardcoded timeout → D9, D14 (backend-aware)
- Security documentation → D15 (startup warning)
- Advisory: interval cleanup, analyzer clearEnv, CLI arg exposure, JSONL rotation

### User Advocate Findings (2 high, 3 medium, 2 low)

- Tools silently disabled → D16 (system message)
- No progress feedback → D17 (elapsed time)
- No cancel → D18 (cancel endpoint)
- Queue invisible → D19 (position indicator)
- Cross-boundary fallback → D20 (CLI-only chain)
- Installation guidance → D21 (URL in error)

---

## Implementation Notes

1. **Cancel PID tracking**: `runCommandWithTimeout` does not currently expose the child process handle. Implementer should either extend it to store the `ChildProcess` reference, or use `pkill` pattern matching similar to `cleanupResumeProcesses`.

2. **First-chat system message**: Track whether the first CLI chat has been sent per session (boolean flag in dispatch plugin state). Only emit the tool-limitation system message once.

3. **chat_thinking cleanup**: The `setInterval` must be cleared on: (a) gateway response received, (b) timeout, (c) cancel, (d) SSE disconnect, (e) gateway crash. Use the same `clearTimeout` pattern as existing timeout handling.

4. **Testing**: The `lane` parameter addition to `runCliAgent` is the only shared infrastructure change. All other changes are in the dispatch plugin and board frontend, which can be tested independently.
