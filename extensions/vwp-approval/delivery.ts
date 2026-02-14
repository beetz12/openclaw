import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { PendingMessage } from "./db.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export function createDeliveryHandler(params: { runtime: PluginRuntime; logger: Logger }) {
  const { runtime, logger } = params;

  return async (msg: PendingMessage, deliverContent: string): Promise<void> => {
    const channel = msg.channel;
    try {
      switch (channel) {
        case "whatsapp":
          await runtime.channel.whatsapp.sendMessageWhatsApp(msg.to, deliverContent, {
            verbose: false,
          });
          break;
        case "telegram":
          await runtime.channel.telegram.sendMessageTelegram(msg.to, deliverContent);
          break;
        default:
          logger.warn(
            `vwp-approval: unsupported delivery channel "${channel}" for message ${msg.id}`,
          );
          return;
      }
      logger.info(`vwp-approval: delivered approved message ${msg.id} via ${channel} to ${msg.to}`);
    } catch (err) {
      logger.error(
        `vwp-approval: delivery failed for message ${msg.id} via ${channel}: ${String(err)}`,
      );
    }
  };
}
