/**
 * Tests for atomic-write.ts
 */

import { readFile, readdir, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { atomicWriteFile } from "./atomic-write.js";

describe("atomicWriteFile", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      tmpdir(),
      `atomic-write-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  it("writes data atomically to a file", async () => {
    const filePath = join(testDir, "test.json");
    const data = JSON.stringify({ test: "data" }, null, 2);

    await atomicWriteFile(filePath, data);

    const result = await readFile(filePath, "utf-8");
    expect(result).toBe(data);
  });

  it("creates parent directories if they don't exist", async () => {
    const filePath = join(testDir, "nested", "deep", "file.json");
    const data = JSON.stringify({ nested: true }, null, 2);

    await atomicWriteFile(filePath, data);

    const result = await readFile(filePath, "utf-8");
    expect(result).toBe(data);
  });

  it("overwrites existing files", async () => {
    const filePath = join(testDir, "overwrite.json");
    const initialData = JSON.stringify({ version: 1 }, null, 2);
    const updatedData = JSON.stringify({ version: 2 }, null, 2);

    await atomicWriteFile(filePath, initialData);
    const initial = await readFile(filePath, "utf-8");
    expect(initial).toBe(initialData);

    await atomicWriteFile(filePath, updatedData);
    const updated = await readFile(filePath, "utf-8");
    expect(updated).toBe(updatedData);
  });

  it("does not leave temporary files behind", async () => {
    const filePath = join(testDir, "clean.json");
    const data = JSON.stringify({ test: "cleanup" }, null, 2);

    await atomicWriteFile(filePath, data);

    const files = await readdir(testDir);
    // Should only have the target file, no .tmp-* files
    expect(files).toEqual(["clean.json"]);
  });

  it("handles multiple writes to the same file", async () => {
    const filePath = join(testDir, "multiple.json");

    for (let i = 0; i < 5; i++) {
      const data = JSON.stringify({ iteration: i }, null, 2);
      await atomicWriteFile(filePath, data);
    }

    const result = await readFile(filePath, "utf-8");
    expect(result).toBe(JSON.stringify({ iteration: 4 }, null, 2));

    // No temp files should remain
    const files = await readdir(testDir);
    expect(files).toEqual(["multiple.json"]);
  });
});
