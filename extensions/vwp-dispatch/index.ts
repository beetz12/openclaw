import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getSharedSSE } from "../vwp-approval/sse.js";
import { AgentStateManager } from "./agent-state.js";
import { analyzeTask } from "./analyzer.js";
import { loadWorkforceAgents, pickBestAgent } from "./assignment-engine.js";
import { moveTask } from "./board-state.js";
import { checkBudget } from "./budget.js";
import { createChatHttpHandler } from "./chat-routes.js";
import { ServerChatStore } from "./chat-store.js";
import * as checkpoint from "./checkpoint.js";
import { checkCliHealth } from "./cli-health-check.js";
import { VwpConfigStore } from "./config-store.js";
import { loadBusinessContext, loadProfile } from "./context-loader.js";
import { getMonthlySpend } from "./cost-tracker.js";
import { createCoworkHttpHandler } from "./cowork-routes.js";
import { createCronHttpHandler } from "./cron-routes.js";
import { GatewayClient } from "./gateway-client.js";
import { HealthMonitor } from "./health-monitor.js";
import { createKanbanHttpHandler } from "./kanban-routes.js";
import { createMemoryClient, MemorySync } from "./memory/index.js";
import { enrichDecomposition, formatEnrichmentPrompt } from "./memory/index.js";
import { createOnboardingHttpHandler } from "./onboarding.js";
import { resolveVwpPath, setVwpBaseDir } from "./paths.js";
import { createProjectHttpHandler, loadProjects } from "./project-registry.js";
import { createDispatchHttpHandler } from "./routes.js";
import { ShutdownManager } from "./shutdown.js";
import { matchSkills } from "./skill-matcher.js";
import { SkillRegistry } from "./skill-registry.js";
import { cleanupOldTasks } from "./task-cleanup.js";
import { TaskQueue } from "./task-queue.js";
import { assembleTeam } from "./team-assembler.js";
import { createTeamHttpHandler } from "./team-config.js";
import { launchTeam } from "./team-launcher.js";
import { discoverTools, type LoadedTool } from "./tool-manifest.js";
import { createToolHttpHandler } from "./tool-routes.js";
import { ToolRunner } from "./tool-runner.js";
import type { TaskRequest } from "./types.js";
import { createUsageHttpHandler } from "./usage-routes.js";

// Re-export public types for consumers.
export { SkillRegistry } from "./skill-registry.js";
export type {
  SkillEntry,
  SkillFrontmatter,
  PluginEntry,
  PluginManifest,
  McpServerEntry,
} from "./skill-registry.js";
export { loadProfile, loadBusinessContext, generateSkillSummary } from "./context-loader.js";
export type { BusinessProfile, BusinessContext, RoleConfig } from "./context-loader.js";

type VwpDispatchPluginConfig = {
  enabled?: boolean;
  pluginsPath?: string;
  toolsPath?: string;
  baseDir?: string;
  /** CLI provider for dispatch (e.g. "claude-cli", "codex-cli", "gemini-cli"). */
  provider?: string;
  /** Model for task analysis (default: "sonnet"). */
  analyzerModel?: string;
  /** Model for team lead (default: "opus"). */
  teamModel?: string;
  /** Max team timeout in ms (default: 10 minutes). */
  teamTimeoutMs?: number;
  perTaskMaxUsd?: number;
  monthlyMaxUsd?: number;
};

const DISPATCH_EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const DISPATCH_REPO_ROOT = resolve(DISPATCH_EXTENSION_DIR, "../..");
const DEFAULT_TOOLS_PATH = join(DISPATCH_REPO_ROOT, "tools");

function resolveToolsPath(toolsPath?: string): string {
  return resolve(toolsPath ?? process.env.VWP_TOOLS_PATH ?? DEFAULT_TOOLS_PATH);
}

const vwpDispatchConfigSchema = {
  validate(value: unknown) {
    if (value === undefined || value === null) {
      return { ok: true as const, value: {} };
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      return { ok: false as const, errors: ["must be an object"] };
    }
    const cfg = value as Record<string, unknown>;
    const errors: string[] = [];
    const allowedKeys = new Set([
      "enabled",
      "pluginsPath",
      "toolsPath",
      "baseDir",
      "provider",
      "analyzerModel",
      "teamModel",
      "teamTimeoutMs",
      "perTaskMaxUsd",
      "monthlyMaxUsd",
    ]);
    for (const key of Object.keys(cfg)) {
      if (!allowedKeys.has(key)) {
        errors.push("must NOT have additional properties");
        break;
      }
    }
    const stringKeys = [
      "pluginsPath",
      "toolsPath",
      "baseDir",
      "provider",
      "analyzerModel",
      "teamModel",
    ] as const;
    for (const key of stringKeys) {
      if (key in cfg && typeof cfg[key] !== "string") {
        errors.push(`${key} must be a string`);
      }
    }
    if ("enabled" in cfg && typeof cfg.enabled !== "boolean") {
      errors.push("enabled must be a boolean");
    }
    const numberKeys = ["teamTimeoutMs", "perTaskMaxUsd", "monthlyMaxUsd"] as const;
    for (const key of numberKeys) {
      if (key in cfg && (typeof cfg[key] !== "number" || !Number.isFinite(cfg[key] as number))) {
        errors.push(`${key} must be a finite number`);
      }
    }
    return errors.length > 0 ? { ok: false as const, errors } : { ok: true as const, value: cfg };
  },
};

export default {
  id: "vwp-dispatch",
  name: "VWP Dispatch",
  description: "Agent team task dispatch system — analyzes, matches, assembles, and launches teams",
  configSchema: vwpDispatchConfigSchema,

  register(api: OpenClawPluginApi) {
    const pluginCfg = (api.pluginConfig ?? {}) as VwpDispatchPluginConfig;
    if (pluginCfg.enabled === false) {
      api.logger.info("vwp-dispatch: disabled by config");
      return;
    }
    setVwpBaseDir(api.resolvePath(pluginCfg.baseDir ?? "vwp"));

    // Initialize skill registry and scan on startup.
    const registry = new SkillRegistry(pluginCfg.pluginsPath);
    const toolsRoot = resolveToolsPath(pluginCfg.toolsPath);
    const queue = new TaskQueue();
    const health = new HealthMonitor((taskId) => {
      api.logger.warn(`vwp-dispatch: task ${taskId} is stuck, auto-failing`);
      void (async () => {
        await checkpoint.saveFinal(taskId, {
          taskId,
          status: "failed",
          subtasks: [],
          synthesizedResult: "Task timed out (stuck detection)",
        });
        await moveTask(taskId, "done");
        sse.emit({ type: "task_column_changed", taskId, from: "in_progress", to: "done" });
        await queue.completeActive();
      })();
    });
    const sse = getSharedSSE();
    const agentState = new AgentStateManager();
    // Defer GatewayClient creation until we know the actual port from the
    // gateway.start hook.  The plugin registers before the HTTP server is
    // listening, so env vars may not reflect the real port yet.
    let gateway: GatewayClient | undefined;
    let detectedBackendType: "cli" | "embedded" = "embedded";

    // Tool runner for workspace tool execution
    const toolRunner = new ToolRunner({ maxConcurrent: 3 });
    let loadedTools: LoadedTool[] = [];

    // Wait for the gateway to finish starting so we know the real port,
    // then create the GatewayClient and connect.
    api.on("gateway_start", async (event: { port: number }) => {
      const token = api.config.gateway?.auth?.token || process.env.OPENCLAW_GATEWAY_TOKEN || "";
      const url = `ws://127.0.0.1:${event.port}`;
      gateway = new GatewayClient({ url, token });

      // Forward gateway events to agent state + SSE
      gateway.on("connected", () => {
        sse.emit({ type: "gateway_status", connected: true });
      });
      gateway.on("disconnected", () => {
        sse.emit({ type: "gateway_status", connected: false });
      });

      const maxAttempts = 3;
      const retryDelayMs = 1_000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await gateway.connect();
          api.logger.info(`vwp-dispatch: connected to OpenClaw Gateway on port ${event.port}`);
          sse.emit({ type: "gateway_status", connected: true });

          // Detect CLI backend mode from config
          const primaryModel = api.config.agents?.defaults?.model?.primary ?? "";
          const providerPart = primaryModel.split("/")[0] ?? "";
          const cliMode = providerPart === "claude-cli" || providerPart === "codex-cli";

          if (cliMode) {
            detectedBackendType = "cli";
            const command = providerPart === "codex-cli" ? "codex" : "claude";
            const healthResult = await checkCliHealth(command);

            if (healthResult.available) {
              api.logger.warn(
                `vwp-dispatch: CLI backend active (${command} ${healthResult.version ?? "unknown"}) — subprocess runs with --dangerously-skip-permissions`,
              );
            } else {
              api.logger.error(
                `vwp-dispatch: CLI backend configured but ${command} not available: ${healthResult.error}`,
              );
            }

            sse.emit({ type: "gateway_status", connected: true, backendType: "cli" } as any);
          }

          return;
        } catch (err) {
          if (attempt < maxAttempts) {
            api.logger.info(
              `vwp-dispatch: gateway not ready, retry ${attempt}/${maxAttempts} in ${retryDelayMs}ms`,
            );
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          } else {
            api.logger.warn(`vwp-dispatch: gateway connection failed: ${String(err)}`);
            sse.emit({ type: "gateway_status", connected: false });
          }
        }
      }
    });

    // Scan skills and load queue state in background.
    let memorySync: MemorySync | undefined;
    void (async () => {
      try {
        await registry.scan();
        api.logger.info(
          `vwp-dispatch: scanned ${registry.getAllSkills().length} skills from ${registry.getPluginsPath()}`,
        );
        registry.watchForChanges();
      } catch (err) {
        api.logger.warn(`vwp-dispatch: skill scan failed: ${String(err)}`);
      }

      try {
        await queue.load();
      } catch (err) {
        api.logger.warn(`vwp-dispatch: queue load failed: ${String(err)}`);
      }

      try {
        const client = await createMemoryClient(await loadProfile());
        memorySync = new MemorySync(client);
        api.logger.info("vwp-dispatch: memory system initialized");
      } catch {
        api.logger.warn("vwp-dispatch: memory system unavailable");
      }

      try {
        const cleaned = await cleanupOldTasks({ maxAgeDays: 90 });
        if (cleaned > 0) api.logger.info(`vwp-dispatch: cleaned up ${cleaned} old tasks`);
      } catch (err) {
        api.logger.warn(`vwp-dispatch: cleanup failed: ${String(err)}`);
      }

      try {
        const toolsDir = await stat(toolsRoot).catch(() => null);
        if (!toolsDir?.isDirectory()) {
          api.logger.info(
            `vwp-dispatch: tools directory not found at ${toolsRoot}; skipping tool discovery`,
          );
        } else {
          loadedTools = await discoverTools(toolsRoot);
          if (loadedTools.length > 0) {
            api.logger.info(
              `vwp-dispatch: discovered ${loadedTools.length} workspace tools from ${toolsRoot}`,
            );
          } else {
            api.logger.info(`vwp-dispatch: no workspace tools found under ${toolsRoot}`);
          }
        }
      } catch (err) {
        api.logger.warn(`vwp-dispatch: tool discovery failed: ${String(err)}`);
      }
    })();

    // Resolve gateway token for auth on HTTP routes.
    const gatewayToken =
      api.config.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? undefined;

    // Register HTTP routes using explicit prefixes instead of the removed
    // generic registerHttpHandler API.
    const httpHandler = createDispatchHttpHandler({
      queue,
      gatewayToken,
      onConfirm: (task: TaskRequest) => {
        void executeTeam(task);
      },
    });

    // Register Kanban HTTP handler — delegates to kanban-routes.ts.
    const kanbanHandler = createKanbanHttpHandler({ gatewayToken, agentState });
    api.registerHttpRoute({
      path: "/vwp/dispatch",
      auth: "plugin",
      match: "prefix",
      handler: async (req, res) => {
        const handled = await httpHandler(req, res);
        if (handled) return true;
        return kanbanHandler(req, res);
      },
    });

    // Tool HTTP routes with real SSE emission
    const toolHandler = createToolHttpHandler({
      gatewayToken,
      runner: toolRunner,
      getTools: () => loadedTools,
      onSSE: (event) => sse.emit(event as any),
    });
    api.registerHttpRoute({
      path: "/vwp/tools",
      auth: "plugin",
      match: "prefix",
      handler: toolHandler,
    });

    // Chat routes with SSE emission
    const chatStore = new ServerChatStore();
    const chatHandler = createChatHttpHandler({
      gatewayToken,
      gateway: () => gateway,
      chatStore,
      onSSE: (event) => sse.emit(event as any),
      getBackendType: () => detectedBackendType,
    });
    api.registerHttpRoute({
      path: "/vwp/chat",
      auth: "plugin",
      match: "prefix",
      handler: chatHandler,
    });

    // Shared singleton store for onboarding + team config (avoids double-open on same SQLite file)
    const configStore = new VwpConfigStore(resolveVwpPath("state.sqlite"), {
      onboardingFile: resolveVwpPath("onboarding.json"),
      teamFile: resolveVwpPath("team.json"),
    });

    // Onboarding routes
    const onboardingHandler = createOnboardingHttpHandler({ gatewayToken, store: configStore });
    api.registerHttpRoute({
      path: "/vwp/onboarding",
      auth: "plugin",
      match: "prefix",
      handler: onboardingHandler,
    });

    // Team config routes
    const teamHandler = createTeamHttpHandler({ gatewayToken, store: configStore });
    api.registerHttpRoute({
      path: "/vwp/team",
      auth: "plugin",
      match: "prefix",
      handler: teamHandler,
    });

    // Project registry routes
    const projectHandler = createProjectHttpHandler({ gatewayToken });
    api.registerHttpRoute({
      path: "/vwp/projects",
      auth: "plugin",
      match: "prefix",
      handler: projectHandler,
    });

    // CoWork agent session routes
    const coworkHandler = createCoworkHttpHandler({
      gatewayToken,
      onSSE: (event) => sse.emit(event as any),
      getProjects: () => loadProjects(),
      getProject: async (id) => {
        const projects = await loadProjects();
        return projects.find((p) => p.id === id) ?? null;
      },
    });
    api.registerHttpRoute({
      path: "/vwp/cowork",
      auth: "plugin",
      match: "prefix",
      handler: coworkHandler,
    });

    // Cron REST bridge — exposes gateway cron RPC methods as HTTP endpoints
    const cronHandler = createCronHttpHandler({
      gatewayToken,
      gateway: () => gateway,
    });
    api.registerHttpRoute({
      path: "/vwp/cron",
      auth: "plugin",
      match: "prefix",
      handler: cronHandler,
    });

    // Usage/sessions/health/config/channels REST bridge
    const usageHandler = createUsageHttpHandler({
      gatewayToken,
      gateway: () => gateway,
    });
    for (const path of ["/vwp/usage", "/vwp/sessions", "/vwp/gateway", "/vwp/channels"] as const) {
      api.registerHttpRoute({
        path,
        auth: "plugin",
        match: "prefix",
        handler: usageHandler,
      });
    }
    api.registerHttpRoute({
      path: "/vwp/health",
      auth: "plugin",
      handler: usageHandler,
    });

    // Auto-analyze tasks when they become active in the queue.
    queue.on("task_started", (task: TaskRequest) => {
      void analyzeNewTask(task);
    });

    // Process next queued task when the active one completes.
    queue.on("task_completed", () => {
      void (async () => {
        // Sync to memory
        if (memorySync) {
          const activeId = queue.activeTaskId;
          if (activeId) void memorySync.syncTaskCompletion(activeId);
        }
        const next = await queue.dequeue();
        if (next) {
          // The dequeue triggers "task_started" which auto-analyzes.
        }
      })();
    });

    /**
     * Phase 1: Analyze a newly submitted task into subtasks.
     * Runs automatically when a task becomes active in the queue.
     * Saves the decomposition so the user can review and confirm.
     */
    async function analyzeNewTask(task: TaskRequest): Promise<void> {
      try {
        api.logger.info(`vwp-dispatch: analyzing task ${task.id}`);
        const decomposition = await analyzeTask(task.text, {
          provider: pluginCfg.provider,
          model: pluginCfg.analyzerModel,
        });
        await checkpoint.saveDecomposition(task.id, decomposition);
        sse.emit({ type: "task_column_changed", taskId: task.id, from: "todo", to: "todo" });
        api.logger.info(
          `vwp-dispatch: task ${task.id} analyzed — ${decomposition.subtasks.length} subtasks, awaiting confirmation`,
        );
      } catch (err) {
        api.logger.error(`vwp-dispatch: analysis failed for task ${task.id}: ${String(err)}`);
        await checkpoint.saveFinal(task.id, {
          taskId: task.id,
          status: "failed",
          subtasks: [],
          synthesizedResult: `Analysis error: ${String(err)}`,
        });
        await queue.completeActive();
      }
    }

    /**
     * Phase 2: Execute the team after the user confirms the decomposition.
     * Triggered by the confirm endpoint.
     */
    async function executeTeam(task: TaskRequest): Promise<void> {
      health.startMonitoring(task.id);

      try {
        // Move board: queued -> in_progress
        await moveTask(task.id, "in_progress");
        sse.emit({ type: "task_column_changed", taskId: task.id, from: "todo", to: "in_progress" });

        // Load the saved decomposition.
        const taskData = await checkpoint.getTaskStatus(task.id);
        const decomposition = taskData.decomposition;
        if (!decomposition) {
          throw new Error("No decomposition found — task was not analyzed");
        }

        // 1. Resolve workforce assignment profile for execution routing.
        const agents = await loadWorkforceAgents();
        const requiredSkills = Array.from(new Set(decomposition.subtasks.map((s) => s.domain)));
        const assignmentDecision = pickBestAgent(agents, {
          roleHint: taskData.assignment.assignedRole ?? undefined,
          requiredSkills,
          manualLock: taskData.assignment.assignmentMode === "manual-lock",
          existing: taskData.assignment,
        });

        await checkpoint.saveAssignmentProfile(task.id, {
          assignedAgentId: assignmentDecision.assignedAgentId,
          assignedRole: assignmentDecision.assignedRole,
          requiredSkills: assignmentDecision.requiredSkills,
          assignmentMode: assignmentDecision.assignmentMode,
          assignmentReason: assignmentDecision.assignmentReason,
          executorAgentId: assignmentDecision.assignedAgentId,
          executionProfile: {
            scoreBreakdown: assignmentDecision.scoreBreakdown,
            selectedAt: Date.now(),
          },
        });

        await checkpoint.saveActivity(task.id, {
          id: randomUUID(),
          taskId: task.id,
          timestamp: Date.now(),
          type: "agent_action",
          agentName: assignmentDecision.assignedRole ?? "orchestrator",
          action: "execution_routed",
          detail: assignmentDecision.assignmentReason,
        });

        // 2. Match subtasks to skills.
        const matches = matchSkills(decomposition.subtasks, registry);

        // 3. Load business context for team lead.
        const context = await loadBusinessContext("lead");

        // 4. Assemble team spec.
        const spec = assembleTeam(matches, context, {
          complexity: decomposition.estimatedComplexity,
        });

        // 3.5. Check budget before launching
        const monthlySpend = await getMonthlySpend();
        const budgetCheck = checkBudget(spec.estimatedCost.estimatedCostUsd, monthlySpend, {
          perTaskMaxUsd: pluginCfg.perTaskMaxUsd,
          monthlyMaxUsd: pluginCfg.monthlyMaxUsd,
        });
        if (!budgetCheck.allowed) {
          throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
        }

        // 4. Register sub-agents + launch team with SSE for real-time events.
        for (const specialist of spec.specialists) {
          await checkpoint.saveSubagent(task.id, {
            id: `${task.id}-${specialist.role}`,
            taskId: task.id,
            timestamp: Date.now(),
            sessionId: `${task.id}:${specialist.role}`,
            agentName: specialist.role,
            status: "active",
            note: `${specialist.skillPlugin}/${specialist.skillName}`,
          });
        }

        api.logger.info(
          `vwp-dispatch: launching team for task ${task.id} (${spec.specialists.length} specialists, ~$${spec.estimatedCost.estimatedCostUsd.toFixed(2)})`,
        );
        await checkpoint.saveActivity(task.id, {
          id: randomUUID(),
          taskId: task.id,
          timestamp: Date.now(),
          type: "status_change",
          action: "team_launch",
          detail: `Launching ${spec.specialists.length} specialists`,
        });

        const handle = await launchTeam(spec, task.id, registry, {
          provider: pluginCfg.provider,
          model: pluginCfg.teamModel ?? "opus",
          timeoutMs: pluginCfg.teamTimeoutMs,
          sse,
          agentState,
        });

        // 5. Stop monitor and move board: in_progress -> review (human approval gate)
        await handle.monitor.stop();

        for (const specialist of spec.specialists) {
          await checkpoint.saveSubagent(task.id, {
            id: `${task.id}-${specialist.role}-completed`,
            taskId: task.id,
            timestamp: Date.now(),
            sessionId: `${task.id}:${specialist.role}`,
            agentName: specialist.role,
            status: "completed",
          });
        }

        await checkpoint.saveDeliverable(task.id, {
          id: `${task.id}-final-deliverable`,
          taskId: task.id,
          timestamp: Date.now(),
          type: "artifact",
          title: "Final synthesized result",
          path: resolveVwpPath("tasks", task.id, "final.json"),
          description: "Synthesized output from specialist team execution",
        });

        await checkpoint.saveActivity(task.id, {
          id: randomUUID(),
          taskId: task.id,
          timestamp: Date.now(),
          type: "status_change",
          action: "ready_for_review",
          detail: "Execution complete, moved to review",
        });

        await moveTask(task.id, "review");
        sse.emit({
          type: "task_column_changed",
          taskId: task.id,
          from: "in_progress",
          to: "review",
        });

        await queue.completeActive();
        agentState.clearForTask(task.id);
        api.logger.info(`vwp-dispatch: task ${task.id} completed and moved to review`);
      } catch (err) {
        api.logger.error(`vwp-dispatch: pipeline failed for task ${task.id}: ${String(err)}`);
        await checkpoint.saveFinal(task.id, {
          taskId: task.id,
          status: "failed",
          subtasks: [],
          synthesizedResult: `Error: ${String(err)}`,
        });
        await queue.completeActive();
        agentState.clearForTask(task.id);
      } finally {
        health.stopMonitoring(task.id);
      }
    }

    const shutdown = new ShutdownManager();
    shutdown.onShutdown(async () => {
      await toolRunner.cancelAll();
      api.logger.info("vwp-dispatch: shutting down...");
      gateway?.disconnect();
      health.dispose();
      await queue.persist();
      registry.stopWatching();
    });
    shutdown.registerSignals();

    api.logger.info("vwp-dispatch: plugin registered");
  },
};
