/**
 * Server-side chat message persistence using append-only JSONL files.
 *
 * Each conversation gets its own directory under `<basePath>/<conversationId>/`.
 * Messages are stored as newline-delimited JSON in `messages.jsonl`.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage } from "./kanban-types.js";
import { resolveVwpPath } from "./paths.js";

export class ServerChatStore {
  private basePath: string;
  private writeTails = new Map<string, Promise<void>>();

  constructor(basePath?: string) {
    this.basePath = basePath ?? resolveVwpPath("chat");
  }

  /**
   * Append a message to a conversation's JSONL file.
   * Creates the directory and file if they don't exist.
   */
  async appendMessage(conversationId: string, msg: ChatMessage): Promise<void> {
    const dir = join(this.basePath, conversationId);
    await mkdir(dir, { recursive: true });

    const filePath = join(dir, "messages.jsonl");
    const line = JSON.stringify(msg) + "\n";

    const previous = this.writeTails.get(filePath) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        // Ensure the file exists before appending.
        try {
          await readFile(filePath);
        } catch {
          await appendFile(filePath, "");
        }

        await appendFile(filePath, line);
      });
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.writeTails.set(filePath, tail);
    void tail.finally(() => {
      if (this.writeTails.get(filePath) === tail) {
        this.writeTails.delete(filePath);
      }
    });
    await current;
  }

  /**
   * Read conversation history, optionally paginated.
   *
   * @param conversationId - The conversation to read
   * @param opts.limit - Maximum number of messages to return
   * @param opts.before - Return only messages before this message ID
   */
  async getHistory(
    conversationId: string,
    opts: { limit: number; before?: string },
  ): Promise<ChatMessage[]> {
    const filePath = join(this.basePath, conversationId, "messages.jsonl");

    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      return [];
    }

    const lines = raw.trim().split("\n").filter(Boolean);
    const messages: ChatMessage[] = [];

    for (const line of lines) {
      try {
        messages.push(JSON.parse(line) as ChatMessage);
      } catch {
        // Skip malformed lines
      }
    }

    let result = messages;

    // Apply "before" cursor: only return messages that appear before the given ID
    if (opts.before) {
      const idx = result.findIndex((m) => m.id === opts.before);
      if (idx >= 0) {
        result = result.slice(0, idx);
      }
    }

    // Apply limit — return the most recent N messages
    if (result.length > opts.limit) {
      result = result.slice(result.length - opts.limit);
    }

    return result;
  }
}
