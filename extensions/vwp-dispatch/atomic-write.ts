/**
 * Atomic file write utility — prevents file corruption on crash.
 *
 * Writes to a temporary file in the same directory, then atomically renames
 * it to the target path. This ensures the target file is never left in a
 * partially-written state.
 */

import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Write data to a file atomically.
 *
 * Creates parent directories if needed, writes to a temporary file,
 * then atomically renames it to the target path.
 *
 * @param filePath - Absolute path to the target file
 * @param data - String data to write
 */
export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpName = join(dir, `.tmp-${randomBytes(6).toString("hex")}`);
  await writeFile(tmpName, data, "utf-8");
  await rename(tmpName, filePath);
}
