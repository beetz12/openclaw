import { NextResponse } from "next/server";

/**
 * Returns gateway connection config from server-side environment.
 * This lets the frontend auto-detect and connect to the local gateway
 * without the user having to manually paste a token.
 */
export function GET() {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
  return NextResponse.json({
    gatewayToken: token,
    hasToken: token.length > 0,
  });
}
