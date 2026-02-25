import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ideaStatusUpdateSchema } from "@/lib/content/schemas";
import { IdeasRepo } from "@/lib/content/repositories/ideas-repo";
import { ActionsRepo } from "@/lib/content/repositories/actions-repo";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ideaStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const ideasRepo = new IdeasRepo(db);
  const actionsRepo = new ActionsRepo(db);
  const existing = ideasRepo.getById(id);

  if (!existing) {
    return NextResponse.json({ error: "idea_not_found" }, { status: 404 });
  }

  const payload = parsed.data;
  db.exec("BEGIN IMMEDIATE;");
  try {
    ideasRepo.updateStatus(id, payload.status);
    actionsRepo.insert({
      id: randomUUID(),
      idea_id: id,
      actor: payload.actor,
      action_type: payload.status === "approved" ? "approve" : "note",
      note: payload.note ?? `Status set to ${payload.status}`,
    });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    const message = error instanceof Error ? error.message : "status_update_failed";
    return NextResponse.json({ error: "status_update_failed", message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, status: payload.status });
}
