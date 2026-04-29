import { useCallback, useEffect, useState } from "react";
import { Plus, Archive } from "lucide-react";
import { api } from "../../services/api";
import { useProject } from "../../hooks/useProject";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { ProjectMembersPanel } from "./ProjectMembersPanel";

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  _count?: { memberships: number; brands: number };
}

interface ProjectsTabProps {
  workspaceId: string;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function ProjectsTab({ workspaceId, onToast }: ProjectsTabProps) {
  const { refresh: refreshSidebar } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Project[]>(`/api/workspaces/${workspaceId}/projects`);
      setProjects(data);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to load projects", "error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onToast]);

  useEffect(() => { load(); }, [load]);

  const handleArchive = async (project: Project) => {
    if (project.slug === "default") {
      onToast("The Default project cannot be archived", "info");
      return;
    }
    if (!confirm(`Archive project "${project.name}"? Members will lose access to it.`)) return;
    try {
      await api(`/api/workspaces/${workspaceId}/projects/${project.id}`, { method: "DELETE" });
      onToast("Project archived", "success");
      await Promise.all([load(), refreshSidebar()]);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to archive", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Projects</h2>
          <p className="text-xs text-gray-500 mt-1">
            Projects group brands and control who can access what. Every workspace has a
            &quot;Default&quot; project that can&apos;t be archived — it&apos;s where existing brands land.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" />
          New Project
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
          No projects yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Slug</th>
                <th className="text-left px-4 py-2.5">Brands</th>
                <th className="text-left px-4 py-2.5">Members</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setDetailProjectId(p.id)}
                      className="text-left font-medium text-gray-900 hover:text-indigo-600"
                    >
                      {p.name}
                    </button>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{p.slug}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p._count?.brands ?? 0}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p._count?.memberships ?? 0}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDetailProjectId(p.id)}
                    >
                      Manage
                    </Button>
                    {p.slug !== "default" && (
                      <button
                        type="button"
                        onClick={() => handleArchive(p)}
                        className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
                        title="Archive project"
                      >
                        <Archive size={12} />
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateProjectModal
          workspaceId={workspaceId}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            await Promise.all([load(), refreshSidebar()]);
          }}
          onToast={onToast}
        />
      )}

      {detailProjectId && (
        <Modal
          isOpen
          onClose={() => setDetailProjectId(null)}
          title="Manage Project"
          size="lg"
        >
          <ProjectMembersPanel
            workspaceId={workspaceId}
            projectId={detailProjectId}
            onToast={onToast}
            onChanged={load}
          />
        </Modal>
      )}
    </div>
  );
}

function CreateProjectModal({
  workspaceId,
  onClose,
  onCreated,
  onToast,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      onToast("Name is required", "error");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/projects`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      onToast("Project created", "success");
      await onCreated();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to create project", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New Project" size="md">
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Q2 Launch"
        />
        <Input
          label="Slug (optional)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="auto-generated from name"
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
