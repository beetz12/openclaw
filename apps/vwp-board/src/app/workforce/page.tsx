"use client";

import { useCallback, useEffect, useState } from "react";
import { kanbanApi } from "@/lib/api-client";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  description: string;
  skills: string[];
  required: boolean;
  active: boolean;
}

interface TeamData {
  businessType: string;
  businessName: string;
  members: TeamMember[];
  updatedAt: number;
}

function MemberForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: TeamMember;
  onSave: (member: TeamMember) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [skills, setSkills] = useState(initial?.skills.join(", ") ?? "");
  const [required, setRequired] = useState(initial?.required ?? false);
  const [active, setActive] = useState(initial?.active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: id || name.toLowerCase().replace(/\s+/g, "-"),
      name,
      role,
      description,
      skills: skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      required,
      active,
    });
  };

  const inputClass =
    "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
  const labelClass = "block text-sm font-medium text-[var(--color-text-secondary)] mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!initial && (
        <div>
          <label className={labelClass}>ID</label>
          <input className={inputClass} value={id} onChange={(e) => setId(e.target.value)} placeholder="auto-generated from name if empty" />
        </div>
      )}
      <div>
        <label className={labelClass}>Name</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className={labelClass}>Role</label>
        <input className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} required />
      </div>
      <div>
        <label className={labelClass}>Description</label>
        <textarea className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div>
        <label className={labelClass}>Skills (comma-separated)</label>
        <input className={inputClass} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. coding, design, writing" />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          {initial ? "Update" : "Add Member"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function WorkforcePage() {
  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchTeam = useCallback(async () => {
    try {
      const data = await kanbanApi.getTeam();
      setTeam(data.team);
      setError(null);
    } catch (err) {
      const msg = err && typeof err === "object" && "error" in err ? (err as { error: string }).error : "Failed to load workforce";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTeam();
  }, [fetchTeam]);

  const handleToggleActive = async (member: TeamMember) => {
    try {
      await kanbanApi.updateTeamMember(member.id, { active: !member.active });
      await fetchTeam();
    } catch {
      setError("Failed to update member status. Please try again.");
      await fetchTeam();
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await kanbanApi.deleteTeamMember(id);
      await fetchTeam();
    } catch {
      setError("Failed to delete member. Please try again.");
      await fetchTeam();
    }
  };

  const handleSaveEdit = async (member: TeamMember) => {
    try {
      await kanbanApi.updateTeamMember(member.id, { ...member });
      setEditingId(null);
      await fetchTeam();
    } catch {
      setError("Failed to save member changes. Please try again.");
      await fetchTeam();
    }
  };

  const handleAddMember = async (member: TeamMember) => {
    try {
      await kanbanApi.addTeamMember(member);
      setShowAddForm(false);
      await fetchTeam();
    } catch {
      setError("Failed to add member. Please try again.");
      await fetchTeam();
    }
  };

  const cardClass = "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6";

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">Loading workforce...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">Workforce Team</h1>
      {team && (
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          {team.businessName} ({team.businessType})
        </p>
      )}

      {error && <div className="mb-4 rounded-[var(--radius-sm)] border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-3">
        {team?.members.map((member) =>
          editingId === member.id ? (
            <div key={member.id} className={cardClass}>
              <MemberForm initial={member} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} />
            </div>
          ) : (
            <div key={member.id} className={`${cardClass} flex items-center justify-between`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--color-text)]">{member.name}</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">({member.role})</span>
                  {member.required && <span className="rounded bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)]">required</span>}
                </div>
                {member.description && <div className="mt-1 text-sm text-[var(--color-text-secondary)]">{member.description}</div>}
                {member.skills.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {member.skills.map((skill) => (
                      <span key={skill} className="rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">{skill}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleToggleActive(member)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    member.active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {member.active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => setEditingId(member.id)}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                >
                  Edit
                </button>
                {!member.required && (
                  <button
                    onClick={() => handleDelete(member.id)}
                    className="rounded-[var(--radius-sm)] border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {showAddForm ? (
        <div className={`${cardClass} mt-4`}>
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Add Team Member</h3>
          <MemberForm onSave={handleAddMember} onCancel={() => setShowAddForm(false)} />
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          + Add Team Member
        </button>
      )}
    </div>
  );
}
