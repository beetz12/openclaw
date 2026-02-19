/** Map CLI subprocess errors to user-friendly messages for Mission Control chat. */

export interface TranslatedError {
  message: string;
  recoverable: boolean;
}

/**
 * Translate raw CLI subprocess errors into user-friendly messages.
 * Covers: ENOENT (missing binary), auth expiry, rate limits, timeouts, permissions.
 */
export function translateCliError(error: Error | string): TranslatedError {
  const msg = typeof error === "string" ? error : error.message;
  const lower = msg.toLowerCase();

  // ENOENT — binary not found
  if (lower.includes("enoent") || lower.includes("not found") || lower.includes("no such file")) {
    return {
      message:
        "Claude CLI is not installed. Visit https://docs.anthropic.com/claude-code to install.",
      recoverable: false,
    };
  }

  // Auth expired / not logged in
  if (
    lower.includes("auth") ||
    lower.includes("login") ||
    lower.includes("session expired") ||
    lower.includes("not authenticated") ||
    lower.includes("unauthorized")
  ) {
    return {
      message: "Claude CLI session expired. Run `claude login` to re-authenticate.",
      recoverable: false,
    };
  }

  // Rate limit
  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("throttl")
  ) {
    return {
      message: "Rate limit reached. Please wait a moment and try again.",
      recoverable: true,
    };
  }

  // Timeout
  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("timed out")) {
    return {
      message: "Response timed out. The request may have been too complex.",
      recoverable: true,
    };
  }

  // Permission denied
  if (lower.includes("permission") || lower.includes("eacces")) {
    return {
      message: "Claude CLI needs permissions. Run `claude` in terminal first.",
      recoverable: false,
    };
  }

  // Generic — sanitize sensitive info from message
  const sanitized = msg
    .replace(/\/Users\/[^\s]+/g, "[path]")
    .replace(/\/home\/[^\s]+/g, "[path]")
    .replace(/sk-[a-zA-Z0-9-]+/g, "[key]")
    .replace(/Bearer\s+[^\s]+/g, "Bearer [token]")
    .slice(0, 200);

  return {
    message: `Agent error: ${sanitized}`,
    recoverable: false,
  };
}
