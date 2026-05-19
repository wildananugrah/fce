import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";

const labelCls = "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const inputCls = "block w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none";

interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  isSuperadmin: boolean;
}

interface UserWorkspace {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: string;
}

interface UserProjectMembership {
  projectId: string;
  projectName: string;
  workspaceId: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  userId: string;
  isSelf: boolean;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
  onChanged: () => void | Promise<void>;
}

export function AdminUserModal({ userId, isSelf, onClose, onToast, onChanged }: Props) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [workspaces, setWorkspaces] = useState<UserWorkspace[]>([]);
  const [allWorkspaces, setAllWorkspaces] = useState<Workspace[]>([]);
  const [projectMemberships, setProjectMemberships] = useState<UserProjectMembership[]>([]);
  // Per-workspace: projects available to add + currently adding state
  const [wsProjects, setWsProjects] = useState<Record<string, { id: string; name: string }[]>>({});
  const [addingProjectFor, setAddingProjectFor] = useState<string | null>(null); // workspaceId
  const [selectedProjectToAdd, setSelectedProjectToAdd] = useState<Record<string, string>>({}); // wsId → projectId
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("active");
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [saving, setSaving] = useState(false);

  // Password reset
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // Workspace assignment
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState("");
  const [pendingRole, setPendingRole] = useState<"admin" | "member">("member");

  // Project assignment (optional, shown after workspace is selected)
  const [workspaceProjects, setWorkspaceProjects] = useState<{ id: string; name: string }[]>([]);
  const [pendingProjectId, setPendingProjectId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [users, ws, all, pm] = await Promise.all([
        api<AdminUser[]>("/api/admin/users"),
        api<UserWorkspace[]>(`/api/admin/users/${userId}/workspaces`),
        api<Workspace[]>("/api/workspaces"),
        api<UserProjectMembership[]>(`/api/admin/users/${userId}/project-memberships`),
      ]);
      const u = users.find((x) => x.id === userId) ?? null;
      setUser(u);
      if (u) {
        setFullName(u.fullName ?? "");
        setEmail(u.email);
        setStatus(u.status);
        setIsSuperadmin(u.isSuperadmin);
      }
      setWorkspaces(ws);
      setAllWorkspaces(all);
      setProjectMemberships(pm);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to load user", "error");
    } finally {
      setLoading(false);
    }
  }, [userId, onToast]);

  useEffect(() => { load(); }, [load]);

  const saveDetails = async () => {
    setSaving(true);
    try {
      await api(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: fullName.trim() || null,
          email: email.trim() || undefined,
          status,
          isSuperadmin,
        }),
      });
      onToast("User updated", "success");
      await load();
      await onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (newPassword.length < 8) {
      onToast("Password must be at least 8 characters", "error");
      return;
    }
    setResetting(true);
    try {
      await api(`/api/admin/users/${userId}/password`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      });
      onToast("Password reset", "success");
      setNewPassword("");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to reset password", "error");
    } finally {
      setResetting(false);
    }
  };

  const assignWorkspace = async () => {
    if (!pendingWorkspaceId) return;
    try {
      await api(`/api/admin/users/${userId}/workspaces/${pendingWorkspaceId}`, {
        method: "PUT",
        body: JSON.stringify({ role: pendingRole }),
      });
      if (pendingProjectId) {
        await api(`/api/admin/users/${userId}/projects/${pendingProjectId}`, { method: "PUT" });
      }
      onToast(pendingProjectId ? "Workspace and project assigned" : "Workspace role set", "success");
      setPendingWorkspaceId("");
      setPendingRole("member");
      setPendingProjectId("");
      setWorkspaceProjects([]);
      await load();
      await onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to assign workspace", "error");
    }
  };

  const removeWorkspace = async (wsId: string, name: string) => {
    if (!confirm(`Remove this user from "${name}"? All project memberships in that workspace will also be cleared.`)) return;
    try {
      await api(`/api/admin/users/${userId}/workspaces/${wsId}`, { method: "DELETE" });
      onToast("Removed from workspace", "info");
      await load();
      await onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to remove", "error");
    }
  };

  const loadWsProjects = async (wsId: string) => {
    if (wsProjects[wsId]) return; // already loaded
    try {
      const projects = await api<{ id: string; name: string }[]>(
        `/api/admin/workspaces/${wsId}/projects`,
      );
      setWsProjects((prev) => ({ ...prev, [wsId]: projects }));
    } catch { /* ignore */ }
  };

  const addProjectMembership = async (wsId: string) => {
    const projectId = selectedProjectToAdd[wsId];
    if (!projectId) return;
    try {
      await api(`/api/admin/users/${userId}/projects/${projectId}`, { method: "PUT" });
      onToast("Added to project", "success");
      setAddingProjectFor(null);
      setSelectedProjectToAdd((prev) => ({ ...prev, [wsId]: "" }));
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  const removeProjectMembership = async (projectId: string, projectName: string) => {
    if (!confirm(`Remove user from project "${projectName}"?`)) return;
    try {
      await api(`/api/admin/users/${userId}/projects/${projectId}`, { method: "DELETE" });
      onToast("Removed from project", "info");
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  const deleteUser = async () => {
    if (isSelf) {
      onToast("You cannot delete your own account", "error");
      return;
    }
    if (!confirm(`Permanently delete ${user?.email}? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/users/${userId}`, { method: "DELETE" });
      onToast("User deleted", "info");
      onClose();
      await onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to delete user", "error");
    }
  };

  const assignedWsIds = new Set(workspaces.map((w) => w.workspaceId));
  const availableWorkspaces = allWorkspaces.filter((w) => !assignedWsIds.has(w.id));

  return (
    <Modal isOpen onClose={onClose} title="Manage User" size="lg">
      {loading || !user ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : (
        <div className="space-y-6">
          {/* Details */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Email</label>
                <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Full name</label>
                <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputCls}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={isSuperadmin}
                  onChange={(e) => setIsSuperadmin(e.target.checked)}
                  disabled={isSelf}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">
                  Superadmin
                  {isSelf && <span className="text-[11px] text-gray-400 ml-1">(can&apos;t revoke your own)</span>}
                </span>
              </label>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={saveDetails} loading={saving}>Save details</Button>
            </div>
          </section>

          {/* Password reset */}
          <section className="space-y-3 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Reset password</h3>
            <p className="text-xs text-gray-500">
              Set a new password for this user. They can change it themselves afterwards.
            </p>
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="New password (min 8 chars)"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button
                size="sm"
                onClick={resetPassword}
                loading={resetting}
                disabled={newPassword.length < 8}
              >
                Reset
              </Button>
            </div>
          </section>

          {/* Workspace assignments */}
          <section className="space-y-3 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Workspace access</h3>
            {workspaces.length === 0 ? (
              <p className="text-sm text-gray-400">Not a member of any workspace yet.</p>
            ) : (
              <div className="space-y-2">
                {workspaces.map((w) => {
                  const wsMemberships = projectMemberships.filter((p) => p.workspaceId === w.workspaceId);
                  const availableToAdd = (wsProjects[w.workspaceId] ?? []).filter(
                    (p) => !wsMemberships.some((m) => m.projectId === p.id),
                  );
                  return (
                    <div key={w.workspaceId} className="border border-gray-200 rounded-md overflow-hidden">
                      {/* Workspace header row */}
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{w.workspaceName}</p>
                          <p className="text-[11px] text-gray-500 font-mono">{w.workspaceSlug}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={w.role}
                            onChange={async (e) => {
                              try {
                                await api(`/api/admin/users/${userId}/workspaces/${w.workspaceId}`, {
                                  method: "PUT",
                                  body: JSON.stringify({ role: e.target.value }),
                                });
                                onToast("Role updated", "success");
                                await load();
                                await onChanged();
                              } catch (err) {
                                onToast(err instanceof Error ? err.message : "Failed", "error");
                              }
                            }}
                            className="px-2 py-1 text-xs bg-white border border-gray-300 rounded"
                          >
                            <option value="admin">admin</option>
                            <option value="member">member</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeWorkspace(w.workspaceId, w.workspaceName)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Project memberships */}
                      <div className="px-3 py-2 bg-white border-t border-gray-100">
                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Projects</p>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {wsMemberships.length === 0 && (
                            <span className="text-xs text-gray-400">No projects assigned</span>
                          )}
                          {wsMemberships.map((pm) => (
                            <span key={pm.projectId} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-xs">
                              {pm.projectName}
                              <button
                                type="button"
                                onClick={() => removeProjectMembership(pm.projectId, pm.projectName)}
                                className="text-indigo-400 hover:text-red-500 ml-0.5"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          {addingProjectFor === w.workspaceId ? (
                            <div className="flex items-center gap-1">
                              <select
                                value={selectedProjectToAdd[w.workspaceId] ?? ""}
                                onChange={(e) => setSelectedProjectToAdd((prev) => ({ ...prev, [w.workspaceId]: e.target.value }))}
                                className="px-2 py-0.5 text-xs border border-gray-300 rounded"
                              >
                                <option value="">— pick project —</option>
                                {availableToAdd.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                              <button type="button" onClick={() => addProjectMembership(w.workspaceId)} className="text-xs text-indigo-600 hover:underline">Add</button>
                              <button type="button" onClick={() => setAddingProjectFor(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { loadWsProjects(w.workspaceId); setAddingProjectFor(w.workspaceId); }}
                              className="text-xs text-indigo-500 hover:underline"
                            >
                              + Add project
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {availableWorkspaces.length > 0 && (
              <div className="flex items-end gap-2 pt-1">
                <div className="flex-1">
                  <label className={labelCls}>Add to workspace</label>
                  <select
                    value={pendingWorkspaceId}
                    onChange={async (e) => {
                      const wsId = e.target.value;
                      setPendingWorkspaceId(wsId);
                      setPendingProjectId("");
                      setWorkspaceProjects([]);
                      if (wsId) {
                        try {
                          const projects = await api<{ id: string; name: string }[]>(
                            `/api/admin/workspaces/${wsId}/projects`,
                          );
                          setWorkspaceProjects(projects);
                        } catch {
                          // projects stay empty — assignment remains optional
                        }
                      }
                    }}
                    className={inputCls}
                  >
                    <option value="">— Select workspace —</option>
                    {availableWorkspaces.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select
                    value={pendingRole}
                    onChange={(e) => setPendingRole(e.target.value as "admin" | "member")}
                    className={inputCls}
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                {workspaceProjects.length > 0 && (
                  <div>
                    <label className={labelCls}>Project <span className="normal-case text-gray-400">(optional)</span></label>
                    <select
                      value={pendingProjectId}
                      onChange={(e) => setPendingProjectId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— None —</option>
                      {workspaceProjects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <Button size="sm" onClick={assignWorkspace} disabled={!pendingWorkspaceId}>
                  Add
                </Button>
              </div>
            )}
          </section>

          {/* Danger zone */}
          <section className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-red-700">Delete user</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Removes the account and every workspace / project membership. Cannot be undone.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={deleteUser}
                disabled={isSelf}
                title={isSelf ? "You cannot delete your own account" : undefined}
              >
                Delete
              </Button>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
