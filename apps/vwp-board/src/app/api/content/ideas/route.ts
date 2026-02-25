import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ideasQuerySchema } from "@/lib/content/schemas";
import { IdeasRepo } from "@/lib/content/repositories/ideas-repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = ideasQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const repo = new IdeasRepo(getDb());
  return NextResponse.json({ items: repo.list(parsed.data) });
}
