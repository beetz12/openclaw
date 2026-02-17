import { test, expect } from "@playwright/test";

test.describe("Chat interface", () => {
  test.beforeEach(async ({ page }) => {
    // Mark onboarding as complete and set up auth
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
      // Clear any previous chat messages
      localStorage.removeItem("vwp-chat-messages");
      localStorage.removeItem("vwp-chat-conversationId");
    });
    await page.goto("/");
  });

  test("Chat page loads as home route", async ({ page }) => {
    await expect(page).toHaveURL("/");
    // Chat input should be visible (may be disabled if gateway not connected)
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  test("Empty state shows placeholder message", async ({ page }) => {
    await expect(page.getByText(/no messages yet|start a conversation/i)).toBeVisible();
  });

  test("Chat input has placeholder text", async ({ page }) => {
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    const placeholder = await input.getAttribute("placeholder");
    expect(placeholder).toBeTruthy();
  });

  test("Send button and Run as task button are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /send message/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /run as task/i })).toBeVisible();
  });

  test("Chat messages persist in localStorage", async ({ page }) => {
    // Inject a fake message into localStorage
    await page.evaluate(() => {
      const messages = [
        {
          id: "test-1",
          role: "user",
          content: "Hello from E2E test",
          timestamp: Date.now(),
        },
      ];
      localStorage.setItem("vwp-chat-messages", JSON.stringify(messages));
    });

    // Reload and verify the message appears
    await page.goto("/");
    await expect(page.getByText("Hello from E2E test")).toBeVisible();
  });

  test("Assistant error messages render correctly", async ({ page }) => {
    await page.evaluate(() => {
      const messages = [
        {
          id: "test-1",
          role: "user",
          content: "Test message",
          timestamp: Date.now() - 5000,
        },
        {
          id: "test-2",
          role: "system",
          content: "Error: No response from gateway.",
          timestamp: Date.now(),
        },
      ];
      localStorage.setItem("vwp-chat-messages", JSON.stringify(messages));
    });

    await page.goto("/");
    await expect(page.getByText("Test message")).toBeVisible();
    await expect(page.getByText(/Error: No response from gateway/)).toBeVisible();
  });

  test("User messages appear in chat", async ({ page }) => {
    await page.evaluate(() => {
      const messages = [
        {
          id: "test-1",
          role: "user",
          content: "User message alignment test",
          timestamp: Date.now(),
        },
      ];
      localStorage.setItem("vwp-chat-messages", JSON.stringify(messages));
    });

    await page.goto("/");
    await expect(page.getByText("User message alignment test")).toBeVisible();
  });
});

test.describe("Chat navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
  });

  test("Desktop sidebar shows all 5 nav tabs", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Board" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tools" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cost" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("Mobile bottom tab bar shows navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Bottom navigation should be visible (use first link match for mobile)
    await expect(page.getByRole("link", { name: /Chat/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Board/i }).first()).toBeVisible();
  });

  test("Navigate from Chat to Board", async ({ page }) => {
    await page.getByRole("link", { name: "Board" }).click();
    await expect(page).toHaveURL(/\/board/);
    await expect(page.getByText("Backlog")).toBeVisible();
  });

  test("Navigate from Chat to Tools", async ({ page }) => {
    await page.getByRole("link", { name: "Tools" }).click();
    await expect(page).toHaveURL(/\/tools/);
    // Check for heading that always renders (API data may fail without auth)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("Navigate from Chat to Cost", async ({ page }) => {
    await page.getByRole("link", { name: "Cost" }).click();
    await expect(page).toHaveURL(/\/cost/);
    // Cost page renders content (heading or Unauthorized message)
    await expect(page.locator("main")).toBeVisible();
  });

  test("Navigate from Chat to Settings", async ({ page }) => {
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("Navigate back to Chat from Board", async ({ page }) => {
    await page.goto("/board");
    await page.getByRole("link", { name: "Chat" }).click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Chat responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
  });

  test("Desktop shows sidebar navigation and chat input", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Sidebar should have the VWP Board heading
    await expect(page.getByRole("heading", { name: "VWP Board" })).toBeVisible();
    // Chat input should be visible
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  test("Mobile hides sidebar and shows bottom tabs", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Chat input should still be visible
    await expect(page.getByRole("textbox")).toBeVisible();
    // Bottom nav should be visible (target the fixed bottom nav, not sidebar)
    const bottomNav = page.locator("nav.md\\:hidden");
    await expect(bottomNav).toBeVisible();
  });

  test("Chat messages are readable on mobile", async ({ page }) => {
    await page.evaluate(() => {
      const messages = [
        {
          id: "test-1",
          role: "user",
          content: "Short mobile message",
          timestamp: Date.now(),
        },
      ];
      localStorage.setItem("vwp-chat-messages", JSON.stringify(messages));
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    await expect(page.getByText("Short mobile message")).toBeVisible();
  });
});

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
    await page.goto("/settings");
  });

  test("Settings page shows team management section", async ({ page }) => {
    await expect(page.getByText("Team Management")).toBeVisible();
    await expect(page.getByRole("button", { name: /add team member/i })).toBeVisible();
  });

  test("Settings page shows Reset Onboarding action", async ({ page }) => {
    await expect(page.getByText("Reset Onboarding")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
  });

  test("Settings page shows Clear Chat History action", async ({ page }) => {
    await expect(page.getByText("Clear Chat History")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
  });
});

test.describe("Gateway status banner", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
    await page.goto("/");
  });

  test("Chat input and buttons exist regardless of gateway state", async ({ page }) => {
    await page.waitForTimeout(2000);

    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();

    // Send and task buttons should exist
    await expect(page.getByRole("button", { name: /send message/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /run as task/i })).toBeVisible();
  });
});
