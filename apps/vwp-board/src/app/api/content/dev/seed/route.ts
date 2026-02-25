import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedContentSample } from "@/lib/content/services/dev-seed";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_available_in_production" }, { status: 403 });
  }

  try {
    const result = seedContentSample(getDb());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "seed_failed";
    return NextResponse.json({ error: "seed_failed", message }, { status: 500 });
  }
}
