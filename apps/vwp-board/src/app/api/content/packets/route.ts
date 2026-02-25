import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { packetsQuerySchema } from "@/lib/content/schemas";
import { PacketsRepo } from "@/lib/content/repositories/packets-repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = packetsQuerySchema.safeParse({
    type: url.searchParams.get("type") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const repo = new PacketsRepo(getDb());
  return NextResponse.json({ items: repo.list(parsed.data) });
}
