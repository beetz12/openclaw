const BLOCKED_PATTERNS = [
  /^OPENCLAW_GATEWAY_TOKEN$/,
  /^AWS_SECRET/,
  /^AWS_SESSION/,
  /^OPENAI_API_KEY$/,
  /^ANTHROPIC_API_KEY$/,
  /^GOOGLE_APPLICATION_CREDENTIALS$/,
  /^DATABASE_URL$/,
  /^REDIS_URL$/,
  /SECRET/i,
  /PASSWORD/i,
  /CREDENTIAL/i,
  /PRIVATE_KEY/i,
];

const ALWAYS_ALLOW = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "TERM",
  "NODE_ENV",
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
  "CLAUDECODE",
]);

/**
 * Build a filtered environment for subprocess execution.
 *
 * @param env - Full process.env
 * @param toolAllowlist - Optional list of env var names that should be passed
 *   through even if they match a BLOCKED_PATTERN. Used by ToolRunner to give
 *   each tool exactly the secrets it declares in its manifest.
 */
export function buildSafeEnv(
  env: Record<string, string | undefined>,
  toolAllowlist?: string[],
): Record<string, string> {
  const safe: Record<string, string> = {};
  const extraAllow = new Set(toolAllowlist ?? []);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (ALWAYS_ALLOW.has(key) || extraAllow.has(key)) {
      safe[key] = value;
      continue;
    }
    if (BLOCKED_PATTERNS.some((p) => p.test(key))) continue;
    safe[key] = value;
  }
  return safe;
}
