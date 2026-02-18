"use client";

import { useState } from "react";
import { useCoworkStore, type Project } from "@/store/cowork-store";
import { kanbanApi } from "@/lib/api-client";

interface McpServerManagerProps {
  projectId: string;
  project: Project;
}

interface EnvVar {
  key: string;
  value: string;
}

export function McpServerManager({ projectId, project }: McpServerManagerProps) {
  const updateMcpServers = useCoworkStore((s) => s.updateMcpServers);
  const projectError = useCoworkStore((s) => s.projectError);

  const [showAddForm, setShowAddForm] = useState(false);
  const [serverName, setServerName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const servers = project.mcpServers ?? {};
  const serverEntries = Object.entries(servers);

  const resetForm = () => {
    setServerName("");
    setCommand("");
    setArgs("");
    setEnvVars([]);
  };

  const handleAddServer = async () => {
    if (!serverName.trim() || !command.trim()) {return;}

    const parsedArgs = args
      .trim()
      .split(/\s+/)
      .filter((a) => a.length > 0);

    const env: Record<string, string> = {};
    for (const v of envVars) {
      if (v.key.trim()) {
        env[v.key.trim()] = v.value;
      }
    }

    const updated = {
      ...servers,
      [serverName.trim()]: {
        command: command.trim(),
        args: parsedArgs,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      },
    };

    await updateMcpServers(projectId, updated);
    resetForm();
    setShowAddForm(false);
  };

  const handleDeleteServer = async (name: string) => {
    const updated = { ...servers };
    delete updated[name];
    await updateMcpServers(projectId, updated);
  };

  const handleAutoDiscover = async () => {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const result = await kanbanApi.validateProject(projectId);
      if (!result.valid && result.error) {
        setDiscoverError(result.error);
      }
      // Refresh projects to pick up discovered servers
      await useCoworkStore.getState().fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiscoverError(msg);
    } finally {
      setDiscovering(false);
    }
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const updateEnvVar = (index: number, field: "key" | "value", val: string) => {
    const updated = [...envVars];
    updated[index] = { ...updated[index], [field]: val };
    setEnvVars(updated);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3" data-testid="mcp-server-manager">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--color-text-secondary)]">
          MCP Servers
        </h4>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleAutoDiscover}
            disabled={discovering}
            data-testid="mcp-auto-discover-btn"
            className="rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
          >
            {discovering ? "Discovering..." : "Auto-discover"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (showAddForm) {resetForm();}
            }}
            data-testid="mcp-add-server-btn"
            className="rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            {showAddForm ? "Cancel" : "+ Add Server"}
          </button>
        </div>
      </div>

      {discoverError && (
        <p className="text-xs text-[var(--color-danger)]" data-testid="mcp-discover-error">
          {discoverError}
        </p>
      )}

      {projectError && (
        <p className="text-xs text-[var(--color-danger)]">{projectError}</p>
      )}

      {showAddForm && (
        <div
          className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          data-testid="mcp-add-form"
        >
          <div>
            <label
              htmlFor="mcp-server-name"
              className="mb-1 block text-xs font-medium text-[var(--color-text)]"
            >
              Server Name
            </label>
            <input
              id="mcp-server-name"
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="my-mcp-server"
              data-testid="mcp-server-name-input"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            />
          </div>

          <div>
            <label
              htmlFor="mcp-server-command"
              className="mb-1 block text-xs font-medium text-[var(--color-text)]"
            >
              Command
            </label>
            <input
              id="mcp-server-command"
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="node, python, npx..."
              data-testid="mcp-server-command-input"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            />
          </div>

          <div>
            <label
              htmlFor="mcp-server-args"
              className="mb-1 block text-xs font-medium text-[var(--color-text)]"
            >
              Arguments (space-separated)
            </label>
            <input
              id="mcp-server-args"
              type="text"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="--port 3000 --verbose"
              data-testid="mcp-server-args-input"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text)]">
                Environment Variables
              </span>
              <button
                type="button"
                onClick={addEnvVar}
                data-testid="mcp-add-env-btn"
                className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] transition-colors"
              >
                + Add Variable
              </button>
            </div>
            {envVars.length > 0 && (
              <div className="space-y-2">
                {envVars.map((ev, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={ev.key}
                      onChange={(e) => updateEnvVar(i, "key", e.target.value)}
                      placeholder="KEY"
                      data-testid={`mcp-env-key-${i}`}
                      className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={ev.value}
                      onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                      placeholder="value"
                      data-testid={`mcp-env-value-${i}`}
                      className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvVar(i)}
                      data-testid={`mcp-env-remove-${i}`}
                      className="shrink-0 rounded p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 2l8 8M10 2l-8 8" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAddServer}
            disabled={!serverName.trim() || !command.trim()}
            data-testid="mcp-save-server-btn"
            className="w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Server
          </button>
        </div>
      )}

      {serverEntries.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]" data-testid="mcp-no-servers">
          No MCP servers configured. Add one or use auto-discover.
        </p>
      ) : (
        <div className="space-y-1" data-testid="mcp-server-list">
          {serverEntries.map(([name, server]) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              data-testid={`mcp-server-${name}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">
                  {name}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] truncate">
                  {server.command} {server.args.join(" ")}
                </p>
                {server.env && Object.keys(server.env).length > 0 && (
                  <p className="text-xs text-[var(--color-text-muted)] truncate">
                    env: {Object.keys(server.env).join(", ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDeleteServer(name)}
                data-testid={`mcp-delete-${name}`}
                className="ml-2 shrink-0 rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)] transition-colors"
                title={`Remove ${name}`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 3l8 8M11 3l-8 8" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
