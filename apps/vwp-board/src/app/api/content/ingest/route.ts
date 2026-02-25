import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestRequestSchema } from "@/lib/content/schemas";
import { ingestContent } from "@/lib/content/services/ingest-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ingestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = ingestContent(getDb(), parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ingest_failed";
    return NextResponse.json({ error: "ingest_failed", message }, { status: 500 });
  }
}
