import type { ApprovalDB, TaskActionType } from "./db.js";
import type { ApprovalSSE } from "./sse.js";

export type ApprovalHookConfig = {
  enabled: boolean;
  autoApprovePatterns: RegExp[];
};

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export function createMessageSendingHook(params: {
  db: ApprovalDB;
  getConfig: () => ApprovalHookConfig;
  logger: Logger;
}) {
  const { db, getConfig, logger } = params;

  return (
    event: { to: string; content: string; metadata?: Record<string, unknown> },
    ctx: { channelId: string; accountId?: string; conversationId?: string },
  ): { cancel?: boolean; content?: string } | void => {
    const config = getConfig();
    if (!config.enabled) {
      return;
    }

    // Check auto-approve patterns
    for (const pattern of config.autoApprovePatterns) {
      if (pattern.test(event.content)) {
        // Log auto-approved messages to DB for dashboard visibility
        db.addPending({
          to: event.to,
          content: event.content,
          channel: ctx.channelId ?? "",
          sessionKey: ctx.conversationId ?? "",
          agentId: ctx.accountId ?? "",
          status: "auto_approved",
        });
        logger.info(`vwp-approval: auto-approved message matching pattern ${pattern.source}`);
        return;
      }
    }

    // Store in pending queue and cancel delivery
    db.addPending({
      to: event.to,
      content: event.content,
      channel: ctx.channelId ?? "",
      sessionKey: ctx.conversationId ?? "",
      agentId: ctx.accountId ?? "",
    });

    logger.info(`vwp-approval: message to ${event.to} queued for approval`);
    return { cancel: true };
  };
}

/**
 * Creates a hook that intercepts task dispatch actions and queues them for
 * human approval. All external actions (email, CRM, social, etc.) are
 * queued by default.
 */
export function createTaskActionHook(params: { db: ApprovalDB; sse: ApprovalSSE; logger: Logger }) {
  const { db, sse, logger } = params;

  return (event: {
    taskId: string;
    actionType: TaskActionType;
    content: string;
  }): { queued: true; actionId: string } => {
    const action = db.insertTaskAction({
      taskId: event.taskId,
      actionType: event.actionType,
      content: event.content,
    });

    sse.emit({ type: "task_action_queued", action });
    logger.info(`vwp-approval: task action ${action.id} (${event.actionType}) queued for approval`);

    return { queued: true, actionId: action.id };
  };
}
