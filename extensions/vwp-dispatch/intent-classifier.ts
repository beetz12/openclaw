/**
 * Intent classifier — determines whether a user message is a chat message,
 * a task dispatch request, or ambiguous.
 *
 * Uses the Gateway's chat.send RPC to classify via a short prompt, then
 * parses the structured JSON response.
 */

import type { GatewayClient } from "./gateway-client.js";

export type IntentResult = {
  intent: "chat" | "task" | "ambiguous";
  confidence: number;
  taskTitle?: string;
};

const CLASSIFICATION_PROMPT = `You are an intent classifier. Analyze the user message and respond with ONLY a JSON object (no markdown, no explanation):
{"intent": "chat"|"task"|"ambiguous", "confidence": 0.0-1.0, "taskTitle": "extracted title if task"}

- "chat": The user is asking a question, making conversation, or requesting information.
- "task": The user wants to create or dispatch a work task (build, fix, create, deploy, etc).
- "ambiguous": Unclear intent.

User message: `;

const CLASSIFY_TIMEOUT_MS = 10_000;

export async function classifyIntent(
  message: string,
  gateway: GatewayClient,
  sessionKey: string,
): Promise<IntentResult> {
  const fallback: IntentResult = { intent: "ambiguous", confidence: 0.5 };

  if (!gateway.isConnected()) {
    return fallback;
  }

  try {
    const result = await Promise.race([
      classifyViaGateway(message, gateway, sessionKey),
      timeout(CLASSIFY_TIMEOUT_MS),
    ]);
    return result ?? fallback;
  } catch {
    return fallback;
  }
}

async function classifyViaGateway(
  message: string,
  gateway: GatewayClient,
  sessionKey: string,
): Promise<IntentResult> {
  const fallback: IntentResult = { intent: "ambiguous", confidence: 0.5 };

  return new Promise<IntentResult>((resolve) => {
    let resolved = false;
    const idempotencyKey = crypto.randomUUID();

    const onChat = (payload: Record<string, unknown>) => {
      if (resolved) return;

      const state = payload.state as string | undefined;
      if (state === "final" || state === "error" || state === "aborted") {
        resolved = true;
        gateway.removeListener("chat", onChat);

        if (state !== "final") {
          resolve(fallback);
          return;
        }

        try {
          const msg = payload.message as { content?: Array<{ text?: string }> } | undefined;
          const text = msg?.content?.[0]?.text ?? "";
          const parsed = JSON.parse(text) as Record<string, unknown>;

          const intent = parsed.intent as string;
          if (intent !== "chat" && intent !== "task" && intent !== "ambiguous") {
            resolve(fallback);
            return;
          }

          const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
          const taskTitle =
            intent === "task" && typeof parsed.taskTitle === "string"
              ? parsed.taskTitle
              : undefined;

          resolve({ intent, confidence, taskTitle });
        } catch {
          resolve(fallback);
        }
      }
    };

    gateway.on("chat", onChat);

    gateway
      .call("chat.send", {
        sessionKey: `classify-${sessionKey}`,
        message: CLASSIFICATION_PROMPT + message,
        idempotencyKey,
      })
      .catch(() => {
        if (!resolved) {
          resolved = true;
          gateway.removeListener("chat", onChat);
          resolve(fallback);
        }
      });
  });
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}
