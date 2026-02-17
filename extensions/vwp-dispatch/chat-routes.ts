/**
 * HTTP routes for Mission Control chat interface.
 *
 * Routes:
 *   POST /vwp/chat/send    — send a chat message, proxy to Gateway, stream via SSE
 *   GET  /vwp/chat/history  — retrieve conversation history
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ServerChatStore } from "./chat-store.js";
import type { GatewayClient } from "./gateway-client.js";
import type { ChatSSEEvent, ChatMessage } from "./kanban-types.js";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

export type ChatRoutesDeps = {
  gatewayToken: string | undefined;
  gateway: GatewayClient;
  chatStore: ServerChatStore;
  onSSE?: (event: ChatSSEEvent) => void;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("body_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function createChatHttpHandler(deps: ChatRoutesDeps) {
  const { gatewayToken, gateway, chatStore, onSSE } = deps;

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const token = getBearerToken(req);
    if (!gatewayToken || !safeEqualSecret(token, gatewayToken)) {
      jsonResponse(res, 401, { error: "Unauthorized" });
      return false;
    }
    return true;
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    // Only handle /vwp/chat/ routes
    if (!pathname.startsWith("/vwp/chat/")) {
      return false;
    }

    // Auth check for all chat routes
    if (!checkAuth(req, res)) return true;

    // POST /vwp/chat/send — send user message, proxy to Gateway
    if (req.method === "POST" && pathname === "/vwp/chat/send") {
      let message: string;
      let conversationId: string;

      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { message?: string; conversationId?: string };
        if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
          jsonResponse(res, 400, { error: "Missing required field: message" });
          return true;
        }
        message = body.message.trim();
        conversationId =
          typeof body.conversationId === "string" && body.conversationId.trim()
            ? body.conversationId.trim()
            : randomUUID();
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      const messageId = randomUUID();
      const idempotencyKey = randomUUID();

      // Save user message to store
      const userMsg: ChatMessage = {
        id: messageId,
        role: "user",
        content: message,
        timestamp: Date.now(),
      };
      await chatStore.appendMessage(conversationId, userMsg);

      // Check gateway connectivity
      if (!gateway.isConnected()) {
        jsonResponse(res, 503, { error: "Gateway not connected" });
        return true;
      }

      // Set up streaming listener for Gateway chat events
      const assistantMessageId = randomUUID();
      let lastContent = "";
      let chatResolved = false;
      let chatTimeout: ReturnType<typeof setTimeout> | undefined;

      const onChat = (payload: Record<string, unknown>) => {
        if (!payload || typeof payload !== "object") return;
        const state = payload.state as string | undefined;
        const msg = payload.message as { content?: Array<{ text?: string }> } | undefined;
        const text = msg?.content?.[0]?.text ?? "";

        if (state === "delta") {
          // Delta text is cumulative — extract the new token
          const newToken = text.slice(lastContent.length);
          lastContent = text;
          if (newToken) {
            onSSE?.({ type: "chat_stream_token", messageId: assistantMessageId, token: newToken });
          }
        } else if (state === "final") {
          chatResolved = true;
          if (chatTimeout) clearTimeout(chatTimeout);
          gateway.removeListener("chat", onChat);
          lastContent = text;
          onSSE?.({
            type: "chat_message",
            messageId: assistantMessageId,
            role: "assistant",
            content: text,
            done: true,
          });

          // Persist assistant message
          const assistantMsg: ChatMessage = {
            id: assistantMessageId,
            role: "assistant",
            content: text,
            timestamp: Date.now(),
          };
          void chatStore.appendMessage(conversationId, assistantMsg);
        } else if (state === "error" || state === "aborted") {
          chatResolved = true;
          if (chatTimeout) clearTimeout(chatTimeout);
          gateway.removeListener("chat", onChat);
          // Error payload uses `errorMessage` field (not message.content[0].text)
          const errMsg = (payload.errorMessage as string | undefined) ?? text;
          const errorContent =
            state === "error" ? `Error: ${errMsg || "Unknown error"}` : "Aborted";
          onSSE?.({
            type: "chat_message",
            messageId: assistantMessageId,
            role: "assistant",
            content: errorContent,
            done: true,
          });
        }
      };

      gateway.on("chat", onChat);

      // Fire the RPC call
      try {
        const result = await gateway.call("chat.send", {
          sessionKey: conversationId,
          message,
          idempotencyKey,
        });
        // Gateway ACKs immediately with { runId, status: "started" }.
        // The agent processes asynchronously and may never broadcast a chat event
        // if it fails early (e.g. missing API key). Add a safety timeout.
        chatTimeout = setTimeout(() => {
          if (!chatResolved) {
            gateway.removeListener("chat", onChat);
            onSSE?.({
              type: "chat_message",
              messageId: assistantMessageId,
              role: "assistant",
              content:
                "Error: No response from gateway. The agent may not be configured correctly.",
              done: true,
            });
          }
        }, 15_000);
      } catch (err) {
        gateway.removeListener("chat", onChat);
        onSSE?.({
          type: "chat_message",
          messageId: assistantMessageId,
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          done: true,
        });
      }

      jsonResponse(res, 202, { messageId, conversationId });
      return true;
    }

    // GET /vwp/chat/history — retrieve conversation history
    if (req.method === "GET" && pathname === "/vwp/chat/history") {
      const conversationId = url.searchParams.get("conversationId");
      if (!conversationId) {
        jsonResponse(res, 400, { error: "Missing required parameter: conversationId" });
        return true;
      }

      const limitStr = url.searchParams.get("limit");
      const limit = limitStr ? Math.max(1, Math.min(1000, parseInt(limitStr, 10) || 100)) : 100;
      const before = url.searchParams.get("before") ?? undefined;

      const messages = await chatStore.getHistory(conversationId, { limit, before });
      jsonResponse(res, 200, { messages });
      return true;
    }

    // Not a chat route we handle
    return false;
  };
}
