import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { NextRequest, NextResponse } from "next/server";

const WORKSPACE = process.env.OPENCLAW_WORKSPACE_DIR ?? "/Users/dave/.openclaw/workspace-dev";
const ALLOWED_PREFIXES = ["docs/", "memory/"];

export async function POST(req: NextRequest) {
  let body: { path?: string; content?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rel = body.path ?? "";
  if (!ALLOWED_PREFIXES.some((p) => rel.startsWith(p))) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 400 });
  }

  const normalized = normalize(rel).replace(/^\/+/, "");
  if (normalized.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content : "";
  const abs = join(WORKSPACE, normalized);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf-8");

  return NextResponse.json({ ok: true, path: normalized });
}
