import { NextResponse } from "next/server";

/**
 * Returns gateway connection config from server-side environment.
 * This lets the frontend auto-detect and connect to the local gateway
 * without the user having to manually paste a token.
 */
export function GET() {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:19001";
  return NextResponse.json({
    gatewayToken: token,
    gatewayUrl,
    hasToken: token.length > 0,
  });
}
