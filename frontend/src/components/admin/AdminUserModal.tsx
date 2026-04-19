import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [users, ws, all] = await Promise.all([
        api<AdminUser[]>("/api/admin/users"),
        api<UserWorkspace[]>(`/api/admin/users/${userId}/workspaces`),
        api<Workspace[]>("/api/workspaces"),
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
      onToast("Workspace role set", "success");
      setPendingWorkspaceId("");
      setPendingRole("member");
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
              <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
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
              <Input
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
              <div className="space-y-1.5">
                {workspaces.map((w) => (
                  <div
                    key={w.workspaceId}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-md"
                  >
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
                ))}
              </div>
            )}

            {availableWorkspaces.length > 0 && (
              <div className="flex items-end gap-2 pt-1">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
                    Add to workspace
                  </label>
                  <select
                    value={pendingWorkspaceId}
                    onChange={(e) => setPendingWorkspaceId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md"
                  >
                    <option value="">— Select workspace —</option>
                    {availableWorkspaces.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Role</label>
                  <select
                    value={pendingRole}
                    onChange={(e) => setPendingRole(e.target.value as "admin" | "member")}
                    className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
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
