import fs from "node:fs";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { ApprovalDB } from "./db.js";
import { createDeliveryHandler } from "./delivery.js";
import { createMessageSendingHook, type ApprovalHookConfig } from "./hook.js";
import { createApprovalHttpHandler } from "./routes.js";
import { getSharedSSE } from "./sse.js";

type VwpApprovalPluginConfig = {
  enabled?: boolean;
  autoApprovePatterns?: string[];
  requireApproval?: string | string[];
  dbPath?: string;
};

const vwpApprovalConfigSchema = {
  validate(value: unknown) {
    if (value === undefined || value === null) {
      return { ok: true as const, value: {} };
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      return { ok: false as const, errors: ["must be an object"] };
    }
    const cfg = value as Record<string, unknown>;
    const errors: string[] = [];
    const allowedKeys = new Set(["enabled", "autoApprovePatterns", "requireApproval", "dbPath"]);
    for (const key of Object.keys(cfg)) {
      if (!allowedKeys.has(key)) {
        errors.push("must NOT have additional properties");
        break;
      }
    }
    if ("enabled" in cfg && typeof cfg.enabled !== "boolean") {
      errors.push("enabled must be a boolean");
    }
    if (
      "autoApprovePatterns" in cfg &&
      (!Array.isArray(cfg.autoApprovePatterns) ||
        !cfg.autoApprovePatterns.every((entry) => typeof entry === "string"))
    ) {
      errors.push("autoApprovePatterns must be an array of strings");
    }
    if (
      "requireApproval" in cfg &&
      typeof cfg.requireApproval !== "string" &&
      (!Array.isArray(cfg.requireApproval) ||
        !cfg.requireApproval.every((entry) => typeof entry === "string"))
    ) {
      errors.push("requireApproval must be a string or array of strings");
    }
    if ("dbPath" in cfg && typeof cfg.dbPath !== "string") {
      errors.push("dbPath must be a string");
    }
    return errors.length > 0 ? { ok: false as const, errors } : { ok: true as const, value: cfg };
  },
};

export default {
  id: "vwp-approval",
  name: "VWP Approval Queue",
  description: "Intercepts outbound messages for human review before delivery",
  configSchema: vwpApprovalConfigSchema,

  register(api: OpenClawPluginApi) {
    const pluginCfg = (api.pluginConfig ?? {}) as VwpApprovalPluginConfig;
    const dbPath = pluginCfg.dbPath
      ? api.resolvePath(pluginCfg.dbPath)
      : path.join(api.dataDir, "vwp-approval.sqlite");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new ApprovalDB(dbPath);
    const sse = getSharedSSE();

    // Compile auto-approve patterns
    const compiledPatterns: RegExp[] = [];
    if (pluginCfg.autoApprovePatterns) {
      for (const pattern of pluginCfg.autoApprovePatterns) {
        try {
          compiledPatterns.push(new RegExp(pattern));
        } catch (err) {
          api.logger.warn(
            `vwp-approval: invalid auto-approve pattern "${pattern}": ${String(err)}`,
          );
        }
      }
    }

    const hookConfig: ApprovalHookConfig = {
      enabled: pluginCfg.enabled !== false,
      autoApprovePatterns: compiledPatterns,
    };

    // Register message_sending hook
    const hook = createMessageSendingHook({
      db,
      getConfig: () => hookConfig,
      logger: api.logger,
    });

    api.on("message_sending", hook);

    // Resolve gateway token for auth
    const gatewayToken =
      api.config.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? undefined;

    // Create delivery handler
    const deliver = createDeliveryHandler({
      runtime: api.runtime,
      logger: api.logger,
    });

    // Register approval API routes under the shared /vwp namespace.
    const httpHandler = createApprovalHttpHandler({
      db,
      sse,
      gatewayToken,
      onApproved: (msg, content) => {
        deliver(msg, content);
      },
    });
    api.registerHttpRoute({
      path: "/vwp",
      auth: "plugin",
      match: "prefix",
      handler: httpHandler,
    });

    api.logger.info(
      `vwp-approval: plugin registered (db: ${dbPath}, enabled: ${hookConfig.enabled})`,
    );
  },
};
