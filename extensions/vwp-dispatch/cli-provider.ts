/**
 * CLI provider abstraction — maps provider names to binary + argument format.
 *
 * Supported providers:
 * - claude-cli → spawns `claude` binary (Claude Code CLI)
 * - codex-cli  → spawns `codex` binary (OpenAI Codex CLI)
 * - gemini-cli → spawns `gemini` binary (Google Gemini CLI)
 */

export type AnalysisInvocationOptions = {
  prompt: string;
  model?: string;
  systemPrompt?: string;
};

export type AgentInvocationOptions = {
  prompt: string;
  model?: string;
};

const PROVIDER_BINARY: Record<string, string> = {
  "claude-cli": "claude",
  "codex-cli": "codex",
  "gemini-cli": "gemini",
};

/**
 * Resolve the CLI binary name for a given provider.
 */
export function resolveCliBinary(provider: string): string {
  if (!provider) return "claude";
  const binary = PROVIDER_BINARY[provider];
  if (!binary) {
    throw new Error(
      `Unsupported CLI provider: "${provider}". Supported: ${Object.keys(PROVIDER_BINARY).join(", ")}`,
    );
  }
  return binary;
}

/**
 * Build the full command array for a task analysis invocation.
 * Analysis calls need JSON output and a system prompt.
 */
export function buildAnalysisInvocation(
  provider: string,
  options: AnalysisInvocationOptions,
): string[] {
  const { prompt, model, systemPrompt } = options;
  const resolvedProvider = provider || "claude-cli";

  switch (resolvedProvider) {
    case "claude-cli": {
      const args = [
        "claude",
        "-p",
        prompt,
        "--output-format",
        "json",
        "--dangerously-skip-permissions",
      ];
      if (model) args.push("--model", model);
      if (systemPrompt) args.push("--append-system-prompt", systemPrompt);
      return args;
    }

    case "codex-cli": {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
      const args = ["codex", "exec", fullPrompt, "--json", "-s", "danger-full-access"];
      if (model) args.push("-m", model);
      return args;
    }

    case "gemini-cli": {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
      const args = ["gemini", "-p", fullPrompt, "-o", "json", "-y"];
      if (model) args.push("-m", model);
      return args;
    }

    default:
      throw new Error(`Unsupported CLI provider: "${resolvedProvider}"`);
  }
}

/**
 * Build the full command array for an agent invocation (team lead or specialist).
 * Agent calls need JSON output and full permissions.
 */
export function buildAgentInvocation(provider: string, options: AgentInvocationOptions): string[] {
  const { prompt, model } = options;
  const resolvedProvider = provider || "claude-cli";

  switch (resolvedProvider) {
    case "claude-cli": {
      const args = [
        "claude",
        "-p",
        prompt,
        "--dangerously-skip-permissions",
        "--output-format",
        "json",
      ];
      if (model) args.push("--model", model);
      return args;
    }

    case "codex-cli": {
      const args = ["codex", "exec", prompt, "--json", "-s", "danger-full-access"];
      if (model) args.push("-m", model);
      return args;
    }

    case "gemini-cli": {
      const args = ["gemini", "-p", prompt, "-o", "json", "-y"];
      if (model) args.push("-m", model);
      return args;
    }

    default:
      throw new Error(`Unsupported CLI provider: "${resolvedProvider}"`);
  }
}
