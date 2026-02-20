/**
 * HTTP routes for Mission Control chat interface.
 *
 * Routes:
 *   POST /vwp/chat/send    — send a chat message, proxy to Gateway, stream via SSE
 *   POST /vwp/chat/cancel  — cancel an in-flight CLI chat request
 *   GET  /vwp/chat/status   — check gateway connection status and backend type
 *   GET  /vwp/chat/history  — retrieve conversation history
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerChatStore } from "./chat-store.js";
import { translateCliError } from "./cli-error-translator.js";
import type { GatewayClient } from "./gateway-client.js";
import type { ChatSSEEvent, ChatMessage } from "./kanban-types.js";
import { getBearerToken, safeEqualSecret } from "./upstream-imports.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

export type ChatRoutesDeps = {
  gatewayToken: string | undefined;
  gateway: GatewayClient | (() => GatewayClient | undefined);
  chatStore: ServerChatStore;
  onSSE?: (event: ChatSSEEvent) => void;
  getBackendType?: () => "cli" | "embedded";
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
  const { gatewayToken, chatStore, onSSE } = deps;
  const resolveGateway = (): GatewayClient | undefined =>
    typeof deps.gateway === "function" ? deps.gateway() : deps.gateway;

  let firstCliChatSent = false;

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
      const gateway = resolveGateway();
      if (!gateway || !gateway.isConnected()) {
        jsonResponse(res, 503, { error: "Gateway not connected" });
        return true;
      }

      // Set up streaming listener for Gateway chat events
      const assistantMessageId = randomUUID();
      let lastContent = "";
      let chatResolved = false;
      let chatTimeout: ReturnType<typeof setTimeout> | undefined;
      let thinkingInterval: ReturnType<typeof setInterval> | undefined;

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
          if (thinkingInterval) clearInterval(thinkingInterval);
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
          if (thinkingInterval) clearInterval(thinkingInterval);
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

          const assistantMsg: ChatMessage = {
            id: assistantMessageId,
            role: "assistant",
            content: errorContent,
            timestamp: Date.now(),
          };
          void chatStore.appendMessage(conversationId, assistantMsg);
        }
      };

      gateway.on("chat", onChat);

      // Fire the RPC call
      const backendType = deps.getBackendType?.() ?? "embedded";
      try {
        const result = await gateway.call("chat.send", {
          sessionKey: conversationId,
          message,
          idempotencyKey,
        });
        // Gateway ACKs immediately with { runId, status: "started" }.
        // The agent processes asynchronously and may never broadcast a chat event
        // if it fails early (e.g. missing API key). Add a safety timeout.

        // Start thinking indicator for CLI backend
        const thinkingStartTime = Date.now();

        if (backendType === "cli") {
          onSSE?.({
            type: "chat_thinking",
            messageId: assistantMessageId,
            status: "processing",
            elapsed_ms: 0,
          } as any);

          thinkingInterval = setInterval(() => {
            if (!chatResolved) {
              onSSE?.({
                type: "chat_thinking",
                messageId: assistantMessageId,
                status: "processing",
                elapsed_ms: Date.now() - thinkingStartTime,
              } as any);
            }
          }, 5_000);
        }

        // First CLI chat system message
        if (backendType === "cli" && !firstCliChatSent) {
          firstCliChatSent = true;
          onSSE?.({
            type: "chat_message",
            messageId: randomUUID(),
            role: "assistant",
            content:
              "Note: Running in CLI mode. Some interactive tools may not be available. Responses may take longer than usual.",
            done: true,
          });
        }

        const timeoutMs = backendType === "cli" ? 120_000 : 15_000;
        chatTimeout = setTimeout(() => {
          if (!chatResolved) {
            if (thinkingInterval) clearInterval(thinkingInterval);
            gateway.removeListener("chat", onChat);
            const errorMsg =
              backendType === "cli"
                ? "Response timed out. The request may have been too complex."
                : "Error: No response from gateway. The agent may not be configured correctly.";
            onSSE?.({
              type: "chat_message",
              messageId: assistantMessageId,
              role: "assistant",
              content: errorMsg,
              done: true,
            });
            const assistantMsg: ChatMessage = {
              id: assistantMessageId,
              role: "assistant",
              content: errorMsg,
              timestamp: Date.now(),
            };
            void chatStore.appendMessage(conversationId, assistantMsg);
          }
        }, timeoutMs);
      } catch (err) {
        if (thinkingInterval) clearInterval(thinkingInterval);
        gateway.removeListener("chat", onChat);

        let errorContent: string;
        if (backendType === "cli") {
          const translated = translateCliError(err instanceof Error ? err : String(err));
          errorContent = translated.message;
        } else {
          errorContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }

        onSSE?.({
          type: "chat_message",
          messageId: assistantMessageId,
          role: "assistant",
          content: errorContent,
          done: true,
        });
        const assistantMsg: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: errorContent,
          timestamp: Date.now(),
        };
        await chatStore.appendMessage(conversationId, assistantMsg);
      }

      jsonResponse(res, 202, { messageId, conversationId });
      return true;
    }

    // POST /vwp/chat/cancel — cancel an in-flight CLI chat request
    if (req.method === "POST" && pathname === "/vwp/chat/cancel") {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { runId?: string };

        const gateway = resolveGateway();
        if (gateway && gateway.isConnected()) {
          try {
            await gateway.call("chat.cancel", { runId: body.runId });
          } catch {
            // Cancel is best-effort
          }
        }

        onSSE?.({
          type: "chat_message",
          messageId: randomUUID(),
          role: "assistant",
          content: "Request cancelled.",
          done: true,
        });

        jsonResponse(res, 200, { cancelled: true });
      } catch {
        jsonResponse(res, 500, { error: "Failed to cancel request" });
      }
      return true;
    }

    // GET /vwp/chat/status — check gateway connection status
    if (req.method === "GET" && pathname === "/vwp/chat/status") {
      const gateway = resolveGateway();
      const connected = !!gateway && gateway.isConnected();
      const backendType = deps.getBackendType?.() ?? "embedded";
      jsonResponse(res, 200, { connected, backendType });
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
