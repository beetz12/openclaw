import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { actionsQuerySchema, contentActionRequestSchema } from "@/lib/content/schemas";
import { ActionsRepo } from "@/lib/content/repositories/actions-repo";
import { IdeasRepo } from "@/lib/content/repositories/ideas-repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = actionsQuerySchema.safeParse({
    idea_id: url.searchParams.get("idea_id") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const repo = new ActionsRepo(db);
  const rows = repo.list({
    ideaId: parsed.data.idea_id,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = contentActionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const actionsRepo = new ActionsRepo(db);
  const ideasRepo = new IdeasRepo(db);
  const payload = parsed.data;

  const idea = ideasRepo.getById(payload.idea_id);
  if (!idea) {
    return NextResponse.json({ error: "idea_not_found" }, { status: 404 });
  }

  const actionId = payload.id ?? randomUUID();

  db.exec("BEGIN IMMEDIATE;");
  try {
    actionsRepo.insert({
      id: actionId,
      idea_id: payload.idea_id,
      actor: payload.actor,
      action_type: payload.action_type,
      note: payload.note,
    });

    if (payload.action_type === "approve") {
      ideasRepo.updateStatus(payload.idea_id, "approved");
    }

    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    const message = error instanceof Error ? error.message : "action_failed";
    return NextResponse.json({ error: "action_failed", message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: actionId, idea_id: payload.idea_id });
}
