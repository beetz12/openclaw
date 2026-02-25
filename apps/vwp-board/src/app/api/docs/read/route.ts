import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { NextRequest, NextResponse } from "next/server";

const WORKSPACE = process.env.OPENCLAW_WORKSPACE_DIR ?? "/Users/dave/.openclaw/workspace-dev";
const ALLOWED_PREFIXES = ["docs/", "memory/"];

export async function GET(req: NextRequest) {
  const rel = req.nextUrl.searchParams.get("path") ?? "";
  if (!ALLOWED_PREFIXES.some((p) => rel.startsWith(p))) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 400 });
  }

  const normalized = normalize(rel).replace(/^\/+/, "");
  if (normalized.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const content = await readFile(join(WORKSPACE, normalized), "utf-8");
    return NextResponse.json({ path: normalized, content });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
