import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { TaskRequest } from "./types.js";
import { analyzeTask } from "./analyzer.js";
import * as checkpoint from "./checkpoint.js";
import { loadBusinessContext } from "./context-loader.js";
import { HealthMonitor } from "./health-monitor.js";
import { createDispatchHttpHandler } from "./routes.js";
import { matchSkills } from "./skill-matcher.js";
import { SkillRegistry } from "./skill-registry.js";
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
    const health = new HealthMonitor();

    // Scan skills and load queue state in background.
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
    })();

    // Resolve gateway token for auth on HTTP routes.
    const gatewayToken =
      api.config.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? undefined;

    // Register HTTP handler — delegates to routes.ts.
    const httpHandler = createDispatchHttpHandler({
      queue,
      gatewayToken,
      onConfirm: (task: TaskRequest) => {
        void runPipeline(task);
      },
    });
    api.registerHttpHandler(httpHandler);

    // Process next queued task when the active one completes.
    queue.on("task_completed", () => {
      void (async () => {
        const next = await queue.dequeue();
        if (next) {
          await runPipeline(next);
        }
      })();
    });

    async function runPipeline(task: TaskRequest): Promise<void> {
      health.startMonitoring(task.id);

      try {
        // 1. Analyze task into subtasks.
        api.logger.info(`vwp-dispatch: analyzing task ${task.id}`);
        const decomposition = await analyzeTask(task.text, {
          provider: pluginCfg.provider,
          model: pluginCfg.analyzerModel,
        });
        await checkpoint.saveDecomposition(task.id, decomposition);

        // 2. Match subtasks to skills.
        const matches = matchSkills(decomposition.subtasks, registry);

        // 3. Load business context for team lead.
        const context = await loadBusinessContext("lead");

        // 4. Assemble team spec.
        const spec = assembleTeam(matches, context, {
          complexity: decomposition.estimatedComplexity,
        });

        // 5. Launch agent team.
        api.logger.info(
          `vwp-dispatch: launching team for task ${task.id} (${spec.specialists.length} specialists, ~$${spec.estimatedCost.estimatedCostUsd.toFixed(2)})`,
        );
        await launchTeam(spec, task.id, registry, {
          model: pluginCfg.teamModel ?? "opus",
          timeoutMs: pluginCfg.teamTimeoutMs,
        });

        // 6. Mark complete.
        await queue.completeActive();
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
      } finally {
        health.stopMonitoring(task.id);
      }
    }

    api.logger.info("vwp-dispatch: plugin registered");
  },
};
