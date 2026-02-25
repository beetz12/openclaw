import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const WORKSPACE = process.env.OPENCLAW_WORKSPACE_DIR ?? "/Users/dave/.openclaw/workspace-dev";
const CANDIDATE_DIRS = ["docs", "memory"];

export async function GET() {
  const files: Array<{ path: string; name: string }> = [];

  for (const dir of CANDIDATE_DIRS) {
    const abs = join(WORKSPACE, dir);
    try {
      const entries = await readdir(abs, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith(".md")) {
          files.push({ path: `${dir}/${e.name}`, name: e.name });
        }
      }
    } catch {
      // ignore missing directories
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return NextResponse.json({ files });
}
