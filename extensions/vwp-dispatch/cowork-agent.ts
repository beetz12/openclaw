/**
 * CoWork agent module — spawns a Claude Code agent session on a local project.
 *
 * Primary path: uses @anthropic-ai/claude-agent-sdk `query()` with Claude Code
 * tools preset. Fallback: spawns via the existing CLI backend (`runCliAgent`).
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { CoworkSSEEvent } from "./kanban-types.js";

const execFileAsync = promisify(execFile);

// --- Session types ---

export interface CoworkSession {
  id: string;
  projectId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  completedAt: number | null;
  costUsd: number;
  error: string | null;
  stashRef: string | null;
}

export interface CoworkStartParams {
  projectId: string;
  rootPath: string;
  prompt: string;
  model?: string;
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  onEvent: (event: CoworkSSEEvent) => void;
  maxBudgetUsd?: number;
  maxTurns?: number;
  permissionMode?: "ask" | "acceptEdits" | "bypassPermissions";
}

// --- Session store (in-memory, last 20) ---

const MAX_SESSIONS = 20;
const sessions: CoworkSession[] = [];
let activeSession: CoworkSession | null = null;
let activeAbort: AbortController | null = null;

export function getActiveSession(): CoworkSession | null {
  return activeSession;
}

export function getRecentSessions(): CoworkSession[] {
  return [...sessions];
}

export function getSessionById(id: string): CoworkSession | null {
  return sessions.find((s) => s.id === id) ?? null;
}

// --- Error categorization ---

function categorizeError(
  message: string,
): "mcp_crash" | "agent_timeout" | "sdk_error" | "cli_fallback" | "unknown" {
  const lower = message.toLowerCase();
  if (lower.includes("mcp") || lower.includes("server")) return "mcp_crash";
  if (lower.includes("timeout")) return "agent_timeout";
  return "sdk_error";
}

// --- Git checkpoint ---

async function gitCheckpoint(rootPath: string, sessionId: string): Promise<string | null> {
  try {
    await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: rootPath });
    const { stdout } = await execFileAsync("git", ["stash", "create", `cowork-${sessionId}`], {
      cwd: rootPath,
    });
    const stashRef = stdout.trim();
    if (stashRef) {
      await execFileAsync(
        "git",
        ["stash", "store", "-m", `cowork-checkpoint-${sessionId}`, stashRef],
        { cwd: rootPath },
      );
    }
    return stashRef || null;
  } catch {
    return null;
  }
}

// --- SDK-based agent session ---

async function runWithSdk(
  session: CoworkSession,
  params: CoworkStartParams,
  abort: AbortController,
): Promise<void> {
  // Dynamic import — may fail if SDK is not installed or incompatible
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const q = query({
    prompt: params.prompt,
    options: {
      model: params.model ?? "claude-sonnet-4-6",
      cwd: params.rootPath,
      tools: { type: "preset", preset: "claude_code" },
      systemPrompt: { type: "preset", preset: "claude_code" },
      permissionMode: params.permissionMode ?? "acceptEdits",
      maxBudgetUsd: params.maxBudgetUsd ?? 5.0,
      maxTurns: params.maxTurns ?? 50,
      mcpServers: Object.fromEntries(
        Object.entries(params.mcpServers ?? {}).map(([name, cfg]) => [
          name,
          { type: "stdio" as const, command: cfg.command, args: cfg.args, env: cfg.env },
        ]),
      ),
    },
  });

  // Wire up abort
  const onAbort = () => void q.interrupt();
  abort.signal.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const msg of q) {
      if (abort.signal.aborted) break;

      switch (msg.type) {
        case "system":
          params.onEvent({
            type: "cowork_started",
            sessionId: session.id,
            projectId: params.projectId,
          });
          break;

        case "assistant":
          for (const block of msg.message.content) {
            if (block.type === "text") {
              params.onEvent({ type: "cowork_text", sessionId: session.id, text: block.text });
            }
            if (block.type === "tool_use") {
              params.onEvent({
                type: "cowork_tool_use",
                sessionId: session.id,
                tool: block.name,
                input: JSON.stringify(block.input).slice(0, 500),
              });
            }
            if (block.type === "tool_result") {
              const output =
                typeof block.content === "string"
                  ? block.content.slice(0, 500)
                  : JSON.stringify(block.content).slice(0, 500);
              params.onEvent({
                type: "cowork_tool_result",
                sessionId: session.id,
                tool: block.tool_use_id,
                output,
              });
            }
          }
          break;

        case "result":
          if (msg.subtype === "success") {
            session.status = "completed";
            session.costUsd = msg.total_cost_usd ?? 0;
            params.onEvent({
              type: "cowork_completed",
              sessionId: session.id,
              result: msg.result ?? "",
              costUsd: session.costUsd,
            });
          } else {
            session.status = "failed";
            session.costUsd = msg.total_cost_usd ?? 0;
            const errors = (msg as any).errors;
            const errMsg = Array.isArray(errors) ? errors.join("; ") : msg.subtype;
            session.error = errMsg;
            params.onEvent({
              type: "cowork_error",
              sessionId: session.id,
              error: errMsg,
              errorSource: categorizeError(errMsg),
            });
          }
          break;
      }
    }
  } finally {
    abort.signal.removeEventListener("abort", onAbort);
  }
}

// --- CLI fallback ---

async function runWithCliFallback(
  session: CoworkSession,
  params: CoworkStartParams,
): Promise<void> {
  const { runCliAgent } = await import("./upstream-imports.js");

  params.onEvent({ type: "cowork_started", sessionId: session.id, projectId: params.projectId });

  const result = await runCliAgent({
    sessionId: session.id,
    sessionFile: "",
    workspaceDir: params.rootPath,
    prompt: params.prompt,
    provider: "claude-cli",
    model: params.model ?? "sonnet",
    timeoutMs: 300_000,
    runId: session.id,
  });

  const text = result.payloads?.[0]?.text ?? "";
  session.status = "completed";
  params.onEvent({
    type: "cowork_completed",
    sessionId: session.id,
    result: text,
    costUsd: 0,
  });
}

// --- Public API ---

export async function startCoworkSession(params: CoworkStartParams): Promise<CoworkSession> {
  if (activeSession && activeSession.status === "running") {
    throw new Error("A cowork session is already running. Cancel it first.");
  }

  const sessionId = randomUUID();
  const session: CoworkSession = {
    id: sessionId,
    projectId: params.projectId,
    status: "running",
    startedAt: Date.now(),
    completedAt: null,
    costUsd: 0,
    error: null,
    stashRef: null,
  };

  // Git checkpoint
  session.stashRef = await gitCheckpoint(params.rootPath, sessionId);

  activeSession = session;
  const abort = new AbortController();
  activeAbort = abort;

  // Store in recent sessions (cap at MAX_SESSIONS)
  sessions.unshift(session);
  if (sessions.length > MAX_SESSIONS) {
    sessions.pop();
  }

  // Run agent in background
  void (async () => {
    try {
      await runWithSdk(session, params, abort);
    } catch (sdkErr) {
      // SDK not available or failed — fall back to CLI
      try {
        await runWithCliFallback(session, params);
      } catch (cliErr) {
        session.status = "failed";
        session.error = cliErr instanceof Error ? cliErr.message : String(cliErr);
        params.onEvent({
          type: "cowork_error",
          sessionId: session.id,
          error: session.error,
          errorSource: "cli_fallback",
        });
      }
    } finally {
      session.completedAt = Date.now();
      if (session.status === "running") {
        session.status = "completed";
      }
      if (activeSession?.id === session.id) {
        activeSession = null;
        activeAbort = null;
      }
    }
  })();

  return session;
}

export async function cancelCoworkSession(): Promise<boolean> {
  if (!activeSession || activeSession.status !== "running") {
    return false;
  }
  activeSession.status = "cancelled";
  activeSession.completedAt = Date.now();
  activeAbort?.abort();
  activeAbort = null;
  const cancelled = activeSession;
  activeSession = null;
  // Keep in sessions list for history
  return true;
}

export async function sendToCoworkSession(_message: string): Promise<boolean> {
  // V1 SDK `query()` does not support multi-turn within a single call.
  // Multi-turn will be supported when we migrate to V2 `createSession()`.
  // For now, return false to indicate follow-up messages are not supported.
  return false;
}
