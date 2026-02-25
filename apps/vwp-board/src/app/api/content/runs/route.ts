import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runsQuerySchema } from "@/lib/content/schemas";
import { RunsRepo } from "@/lib/content/repositories/runs-repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = runsQuerySchema.safeParse({
    trigger_type: url.searchParams.get("trigger_type") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const repo = new RunsRepo(getDb());
  return NextResponse.json({ items: repo.list(parsed.data) });
}
