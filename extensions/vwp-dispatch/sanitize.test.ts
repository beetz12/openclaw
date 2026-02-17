import { describe, it, expect } from "vitest";
import { sanitizeTaskText } from "./sanitize.js";

describe("sanitizeTaskText", () => {
  it("passes normal text through", () => {
    const text = "Create a new feature for user authentication";
    expect(sanitizeTaskText(text)).toBe(text);
  });

  it("strips null bytes", () => {
    const text = "Task with\0null\0bytes";
    const result = sanitizeTaskText(text);
    expect(result).toBe("Task withnullbytes");
    expect(result).not.toContain("\0");
  });

  it("enforces max length", () => {
    const longText = "a".repeat(15_000);
    const result = sanitizeTaskText(longText);
    expect(result.length).toBe(10_000);
    expect(result).toBe("a".repeat(10_000));
  });

  it("trims whitespace", () => {
    const text = "  \n  Task with whitespace  \n  ";
    expect(sanitizeTaskText(text)).toBe("Task with whitespace");
  });

  it("rejects empty text", () => {
    expect(() => sanitizeTaskText("")).toThrow("Task text is empty after sanitization");
  });

  it("rejects text that becomes empty after sanitization", () => {
    expect(() => sanitizeTaskText("   \n\t   ")).toThrow("Task text is empty after sanitization");
  });

  it("handles mixed null bytes and whitespace", () => {
    const text = "  \0  Task\0with\0mixed  \0  ";
    const result = sanitizeTaskText(text);
    expect(result).toBe("Taskwithmixed");
  });

  it("preserves legitimate special characters", () => {
    const text = "Task: use @mentions, #tags, and $variables!";
    expect(sanitizeTaskText(text)).toBe(text);
  });
});
