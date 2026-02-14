import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { ApprovalDB } from "./db.js";
import { createDeliveryHandler } from "./delivery.js";
import { createMessageSendingHook, type ApprovalHookConfig } from "./hook.js";
import { createApprovalHttpHandler } from "./routes.js";
import { ApprovalSSE } from "./sse.js";

type VwpApprovalPluginConfig = {
  enabled?: boolean;
  autoApprovePatterns?: string[];
  requireApproval?: string | string[];
  dbPath?: string;
};

export default {
  id: "vwp-approval",
  name: "VWP Approval Queue",
  description: "Intercepts outbound messages for human review before delivery",

  register(api: OpenClawPluginApi) {
    const pluginCfg = (api.pluginConfig ?? {}) as VwpApprovalPluginConfig;
    const dbPath = api.resolvePath(pluginCfg.dbPath ?? "vwp-approval.sqlite");
    const db = new ApprovalDB(dbPath);
    const sse = new ApprovalSSE();

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

    // Register HTTP handler for approval API routes
    const httpHandler = createApprovalHttpHandler({
      db,
      sse,
      gatewayToken,
      onApproved: (msg, content) => {
        deliver(msg, content);
      },
    });
    api.registerHttpHandler(httpHandler);

    api.logger.info(
      `vwp-approval: plugin registered (db: ${dbPath}, enabled: ${hookConfig.enabled})`,
    );
  },
};
