import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { TaskRequest } from "./types.js";
import { ApprovalSSE } from "../vwp-approval/sse.js";
import { AgentStateManager } from "./agent-state.js";
import { analyzeTask } from "./analyzer.js";
import { moveTask } from "./board-state.js";
import { checkBudget } from "./budget.js";
import * as checkpoint from "./checkpoint.js";
import { loadBusinessContext, loadProfile } from "./context-loader.js";
import { getMonthlySpend } from "./cost-tracker.js";
import { GatewayClient } from "./gateway-client.js";
import { HealthMonitor } from "./health-monitor.js";
import { createKanbanHttpHandler } from "./kanban-routes.js";
import { createMemoryClient, MemorySync } from "./memory/index.js";
import { enrichDecomposition, formatEnrichmentPrompt } from "./memory/index.js";
import { createDispatchHttpHandler } from "./routes.js";
import { ShutdownManager } from "./shutdown.js";
import { matchSkills } from "./skill-matcher.js";
import { SkillRegistry } from "./skill-registry.js";
import { cleanupOldTasks } from "./task-cleanup.js";
import { TaskQueue } from "./task-queue.js";
import { assembleTeam } from "./team-assembler.js";
import { launchTeam } from "./team-launcher.js";

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
  /** Provider for LLM calls (default: "claude-cli"). */
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

export default {
  id: "vwp-dispatch",
  name: "VWP Dispatch",
  description: "Agent team task dispatch system — analyzes, matches, assembles, and launches teams",

  register(api: OpenClawPluginApi) {
    const pluginCfg = (api.pluginConfig ?? {}) as VwpDispatchPluginConfig;
    if (pluginCfg.enabled === false) {
      api.logger.info("vwp-dispatch: disabled by config");
      return;
    }

    // Initialize skill registry and scan on startup.
    const registry = new SkillRegistry(pluginCfg.pluginsPath);
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
    const sse = new ApprovalSSE();
    const agentState = new AgentStateManager();
    const gateway = new GatewayClient();

    // Connect to gateway in background (non-blocking)
    void (async () => {
      try {
        await gateway.connect();
        api.logger.info("vwp-dispatch: connected to OpenClaw Gateway");
        sse.emit({ type: "gateway_status", connected: true });
      } catch (err) {
        api.logger.warn(`vwp-dispatch: gateway connection failed: ${String(err)}`);
        sse.emit({ type: "gateway_status", connected: false });
      }
    })();

    // Forward gateway events to agent state + SSE
    gateway.on("connected", () => {
      sse.emit({ type: "gateway_status", connected: true });
    });
    gateway.on("disconnected", () => {
      sse.emit({ type: "gateway_status", connected: false });
    });

    // Scan skills and load queue state in background.
    let memorySync: MemorySync | undefined;
    void (async () => {
      try {
        await registry.scan();
        api.logger.info(`vwp-dispatch: scanned ${registry.getAllSkills().length} skills`);
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
    })();

    // Resolve gateway token for auth on HTTP routes.
    const gatewayToken =
      api.config.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? undefined;

    // Register HTTP handler — delegates to routes.ts.
    const httpHandler = createDispatchHttpHandler({
      queue,
      gatewayToken,
      onConfirm: (task: TaskRequest) => {
        void executeTeam(task);
      },
    });
    api.registerHttpHandler(httpHandler);

    // Register Kanban HTTP handler — delegates to kanban-routes.ts.
    const kanbanHandler = createKanbanHttpHandler({ gatewayToken, agentState });
    api.registerHttpHandler(kanbanHandler);

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

        // 1. Match subtasks to skills.
        const matches = matchSkills(decomposition.subtasks, registry);

        // 2. Load business context for team lead.
        const context = await loadBusinessContext("lead");

        // 3. Assemble team spec.
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

        // 4. Launch agent team with SSE for real-time events.
        api.logger.info(
          `vwp-dispatch: launching team for task ${task.id} (${spec.specialists.length} specialists, ~$${spec.estimatedCost.estimatedCostUsd.toFixed(2)})`,
        );
        const handle = await launchTeam(spec, task.id, registry, {
          model: pluginCfg.teamModel ?? "opus",
          timeoutMs: pluginCfg.teamTimeoutMs,
          sse,
          agentState,
        });

        // 5. Stop the monitor and move board: in_progress -> review -> done
        await handle.monitor.stop();
        await moveTask(task.id, "review");
        sse.emit({
          type: "task_column_changed",
          taskId: task.id,
          from: "in_progress",
          to: "review",
        });

        await moveTask(task.id, "done");
        sse.emit({ type: "task_column_changed", taskId: task.id, from: "review", to: "done" });

        await queue.completeActive();
        agentState.clearForTask(task.id);
        api.logger.info(`vwp-dispatch: task ${task.id} completed`);
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
      api.logger.info("vwp-dispatch: shutting down...");
      gateway.disconnect();
      health.dispose();
      await queue.persist();
      registry.stopWatching();
    });
    shutdown.registerSignals();

    api.logger.info("vwp-dispatch: plugin registered");
  },
};
