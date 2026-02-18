"use client";

import { useState, useEffect, useRef } from "react";
import { useCoworkStore } from "@/store/cowork-store";

export function ProjectSelector() {
  const projects = useCoworkStore((s) => s.projects);
  const selectedProjectId = useCoworkStore((s) => s.selectedProjectId);
  const projectsLoading = useCoworkStore((s) => s.projectsLoading);
  const projectError = useCoworkStore((s) => s.projectError);
  const fetchProjects = useCoworkStore((s) => s.fetchProjects);
  const registerProject = useCoworkStore((s) => s.registerProject);
  const removeProject = useCoworkStore((s) => s.removeProject);
  const selectProject = useCoworkStore((s) => s.selectProject);

  const [folderPath, setFolderPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const pathRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const isElectron =
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).electronAPI !== undefined &&
    (window as unknown as Record<string, { isElectron?: boolean }>).electronAPI?.isElectron === true;

  const handleSelectFolder = async () => {
    if (isElectron) {
      const selected = await (
        window as unknown as { electronAPI: { selectProjectFolder: () => Promise<string | null> } }
      ).electronAPI.selectProjectFolder();
      if (selected) {
        setFolderPath(selected);
        // Derive a default name from path
        const parts = selected.split("/");
        setProjectName(parts[parts.length - 1] || "");
      }
    }
    // In browser mode, user types the path manually
  };

  const handleRegister = async () => {
    if (!folderPath.trim() || !projectName.trim()) {return;}
    await registerProject(projectName.trim(), folderPath.trim());
    setFolderPath("");
    setProjectName("");
    setShowRegister(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">
          Projects
        </h3>
        <button
          type="button"
          onClick={() => {
            setShowRegister(!showRegister);
            if (!showRegister) {
              setTimeout(() => pathRef.current?.focus(), 50);
            }
          }}
          className="rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          {showRegister ? "Cancel" : "+ Add Project"}
        </button>
      </div>

      {showRegister && (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div>
            <label
              htmlFor="project-name"
              className="mb-1 block text-xs font-medium text-[var(--color-text)]"
            >
              Project Name
            </label>
            <input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-project"
              data-testid="project-name-input"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            />
          </div>
          <div>
            <label
              htmlFor="project-path"
              className="mb-1 block text-xs font-medium text-[var(--color-text)]"
            >
              Folder Path
            </label>
            <div className="flex gap-2">
              <input
                ref={pathRef}
                id="project-path"
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/Users/you/Work/my-project"
                data-testid="project-path-input"
                className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              />
              {isElectron && (
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                >
                  Browse
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRegister}
            disabled={!folderPath.trim() || !projectName.trim()}
            data-testid="register-project-btn"
            className="w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Register Project
          </button>
        </div>
      )}

      {projectError && (
        <p className="text-xs text-[var(--color-danger)]">{projectError}</p>
      )}

      {projectsLoading ? (
        <p className="text-xs text-[var(--color-text-secondary)]">Loading projects...</p>
      ) : projects.length === 0 ? (
        <p className="text-xs text-[var(--color-text-secondary)]">
          No projects registered. Add a project folder to get started.
        </p>
      ) : (
        <div className="space-y-1">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => selectProject(project.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {selectProject(project.id);}
              }}
              data-testid={`project-item-${project.id}`}
              className={`flex items-center justify-between rounded-[var(--radius-sm)] border px-3 py-2 cursor-pointer transition-colors ${
                selectedProjectId === project.id
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-bg-subtle)]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">
                  {project.name}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] truncate">
                  {project.rootPath}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeProject(project.id);
                }}
                className="ml-2 shrink-0 rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)] transition-colors"
                title="Remove project"
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
