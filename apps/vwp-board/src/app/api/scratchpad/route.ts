import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

const WORKSPACE = process.env.OPENCLAW_WORKSPACE_DIR ?? "/Users/dave/.openclaw/workspace-dev";

export async function POST(req: NextRequest) {
  let body: { text?: string; mode?: "execute-now" | "queue-task" | "save-memory" } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {return NextResponse.json({ error: "text is required" }, { status: 400 });}

  const mode = body.mode ?? "save-memory";
  const now = new Date();

  // Initial implementation routes all modes to durable memory capture; execution
  // modes can be connected to dispatch endpoints in follow-up tasks.
  const rel = `memory/${now.toISOString().slice(0, 10)}.md`;
  const abs = join(WORKSPACE, rel);
  await mkdir(join(WORKSPACE, "memory"), { recursive: true });
  await appendFile(abs, `\n- [scratchpad:${mode}] ${text}\n`, "utf-8");

  return NextResponse.json({ ok: true, mode, path: rel });
}
