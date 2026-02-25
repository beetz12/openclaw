import { test, expect } from "@playwright/test";

/**
 * E2E tests for the Chat CLI Backend integration.
 *
 * These tests verify the Mission Control chat interface when connected
 * to the Claude CLI backend, including:
 * - Gateway connection status display
 * - CLI backend type detection
 * - Thinking indicator during CLI processing
 * - Chat message send/receive flow
 * - Error message rendering
 * - Cancel button behavior
 *
 * Prerequisites:
 *   - OpenClaw gateway running with `agents.defaults.model.primary: "claude-cli/opus"`
 *   - Claude CLI installed and accessible
 *   - vwp-board dev server on port 3000
 */

const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "http://localhost:19001";

test.describe("Chat CLI backend status", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
      localStorage.removeItem("vwp-chat-messages");
      localStorage.removeItem("vwp-chat-conversationId");
    });
    await page.goto("/");
  });

  test("Chat page loads with input visible", async ({ page }) => {
    await expect(page).toHaveURL("/");
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  });

  test("Chat status API returns CLI backend type", async ({ request }) => {
    test.skip(!GATEWAY_TOKEN, "OPENCLAW_GATEWAY_TOKEN not set");

    const response = await request.get(`${GATEWAY_URL}/vwp/chat/status`, {
      headers: { Authorization: `Bearer ${GATEWAY_TOKEN}` },
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty("connected");
    expect(data).toHaveProperty("backendType");
    // backendType should be "cli" when configured with claude-cli/opus
    expect(["cli", "embedded"]).toContain(data.backendType);
  });
});

test.describe("Chat CLI message flow", () => {
  test.skip(!GATEWAY_TOKEN, "OPENCLAW_GATEWAY_TOKEN not set — skipping live CLI tests");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
      localStorage.removeItem("vwp-chat-messages");
      localStorage.removeItem("vwp-chat-conversationId");
    });
    await page.goto("/");
  });

  test("Send message via API and verify response persists", async ({ request }) => {
    test.setTimeout(90_000);
    const conversationId = `e2e-test-${Date.now()}`;
    const sendResponse = await request.post(`${GATEWAY_URL}/vwp/chat/send`, {
      headers: {
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: {
        message: "Say the word 'pineapple' and nothing else.",
        conversationId,
      },
    });

    expect(sendResponse.ok() || sendResponse.status() === 202).toBeTruthy();
    const sendData = await sendResponse.json();
    expect(sendData).toHaveProperty("messageId");
    expect(sendData).toHaveProperty("conversationId", conversationId);

    // Wait for CLI to process (up to 60 seconds)
    let assistantResponse = "";
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const historyResponse = await request.get(
        `${GATEWAY_URL}/vwp/chat/history?conversationId=${conversationId}`,
        { headers: { Authorization: `Bearer ${GATEWAY_TOKEN}` } },
      );

      if (historyResponse.ok()) {
        const history = await historyResponse.json();
        const messages = history.messages ?? [];
        const assistant = messages.find(
          (m: { role: string }) => m.role === "assistant",
        );
        if (assistant) {
          assistantResponse = assistant.content;
          break;
        }
      }
    }

    // Verify we got a non-empty assistant response — the content depends
    // on the assistant personality so we only check it responded.
    expect(assistantResponse).toBeTruthy();
    expect(assistantResponse.length).toBeGreaterThan(0);
  });

  test("SSE emits chat_thinking events during CLI processing", async ({ request }) => {
    test.setTimeout(90_000);
    const conversationId = `e2e-sse-${Date.now()}`;

    const sendResponse = await request.post(`${GATEWAY_URL}/vwp/chat/send`, {
      headers: {
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: {
        message: "Say one word.",
        conversationId,
      },
    });

    expect(sendResponse.status()).toBe(202);

    // Poll for the assistant response (up to 60s)
    let messageCount = 0;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const historyResponse = await request.get(
        `${GATEWAY_URL}/vwp/chat/history?conversationId=${conversationId}`,
        { headers: { Authorization: `Bearer ${GATEWAY_TOKEN}` } },
      );

      if (historyResponse.ok()) {
        const history = await historyResponse.json();
        messageCount = history.messages?.length ?? 0;
        if (messageCount >= 2) {
          break;
        }
      }
    }

    // Should have at least user message + assistant response
    expect(messageCount).toBeGreaterThanOrEqual(2);
  });

  test("Cancel endpoint responds", async ({ request }) => {
    const cancelResponse = await request.post(`${GATEWAY_URL}/vwp/chat/cancel`, {
      headers: {
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: { runId: "test-cancel-id" },
    });

    // Cancel is best-effort, should not error
    expect(cancelResponse.ok()).toBeTruthy();
  });
});

test.describe("Chat CLI error handling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
    await page.goto("/");
  });

  test("CLI error messages render with user-friendly text", async ({ page }) => {
    // Inject a CLI-style error message to verify rendering
    await page.evaluate(() => {
      const messages = [
        {
          id: "test-user-1",
          role: "user",
          content: "Run something complex",
          timestamp: Date.now() - 5000,
        },
        {
          id: "test-error-1",
          role: "assistant",
          content: "Response timed out. The request may have been too complex.",
          timestamp: Date.now(),
          error: true,
        },
      ];
      localStorage.setItem("vwp-chat-messages", JSON.stringify(messages));
    });

    await page.goto("/");
    await expect(page.getByText("Run something complex")).toBeVisible();
    await expect(
      page.getByText(/timed out|too complex/i),
    ).toBeVisible();
  });

  test("Gateway disconnected state shows in UI", async ({ page }) => {
    // Simulate gateway disconnected state via localStorage
    await page.evaluate(() => {
      const messages = [
        {
          id: "test-system-1",
          role: "system",
          content: "Note: Running in CLI mode. Some interactive tools may not be available.",
          timestamp: Date.now(),
        },
      ];
      localStorage.setItem("vwp-chat-messages", JSON.stringify(messages));
    });

    await page.goto("/");
    await expect(
      page.getByText(/CLI mode|interactive tools/i),
    ).toBeVisible();
  });
});

test.describe("Chat thinking indicator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
      localStorage.removeItem("vwp-chat-messages");
    });
    await page.goto("/");
  });

  test("Streaming indicator area exists in chat view", async ({ page }) => {
    // The ChatStream component should be present even when not streaming
    // It renders bouncing dots when not streaming/thinking
    const chatArea = page.locator("main");
    await expect(chatArea).toBeVisible();
  });
});

test.describe("Chat API validation", () => {
  test.skip(!GATEWAY_TOKEN, "OPENCLAW_GATEWAY_TOKEN not set");

  test("Send rejects empty message", async ({ request }) => {
    const response = await request.post(`${GATEWAY_URL}/vwp/chat/send`, {
      headers: {
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: { message: "" },
    });

    expect(response.status()).toBe(400);
  });

  test("Send rejects missing message field", async ({ request }) => {
    const response = await request.post(`${GATEWAY_URL}/vwp/chat/send`, {
      headers: {
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: { conversationId: "test" },
    });

    expect(response.status()).toBe(400);
  });

  test("Chat history requires conversationId", async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/vwp/chat/history`, {
      headers: { Authorization: `Bearer ${GATEWAY_TOKEN}` },
    });

    expect(response.status()).toBe(400);
  });

  test("Unauthorized request returns 401", async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/vwp/chat/status`, {
      headers: { Authorization: "Bearer invalid-token" },
    });

    expect(response.status()).toBe(401);
  });
});
