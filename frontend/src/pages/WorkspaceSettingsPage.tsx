import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Tabs } from "../components/ui/Tabs";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

interface Member {
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
}

const TABS = [
  { key: "general", label: "General" },
  { key: "team", label: "Team" },
  { key: "invitations", label: "Invitations" },
];

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

function roleBadgeVariant(role: string): "info" | "warning" | "default" {
  if (role === "admin") return "info";
  if (role === "editor") return "warning";
  return "default";
}

function inviteStatusVariant(status: string): "success" | "warning" | "danger" | "default" {
  if (status === "accepted") return "success";
  if (status === "pending") return "warning";
  if (status === "revoked") return "danger";
  return "default";
}

// ---- General Tab ----
interface GeneralTabProps {
  workspaceId: string;
  initial: {
    name: string;
    description: string;
    avatarColor: string;
    avatarEmoji: string;
  };
  onToast: (msg: string, type: "success" | "error" | "info") => void;
  onRefresh: () => Promise<void>;
}

function GeneralTab({ workspaceId, initial, onToast, onRefresh }: GeneralTabProps) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [avatarColor, setAvatarColor] = useState(initial.avatarColor);
  const [avatarEmoji, setAvatarEmoji] = useState(initial.avatarEmoji);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      onToast("Workspace name is required", "error");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          avatarColor,
          avatarEmoji: avatarEmoji.trim() || null,
        }),
      });
      onToast("Workspace updated", "success");
      await onRefresh();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to update workspace", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <Input
        label="Workspace Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My Workspace"
      />
      <Input
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What is this workspace for?"
      />
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Avatar Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={avatarColor}
              onChange={(e) => setAvatarColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-gray-300"
            />
            <span className="text-sm text-gray-600">{avatarColor}</span>
          </div>
        </div>
        <div className="flex-1">
          <Input
            label="Avatar Emoji"
            value={avatarEmoji}
            onChange={(e) => setAvatarEmoji(e.target.value)}
            placeholder="🚀"
          />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ---- Team Tab ----
interface TeamTabProps {
  workspaceId: string;
  currentUserId: string;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function TeamTab({ workspaceId, currentUserId, onToast }: TeamTabProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Member[]>(`/api/workspaces/${workspaceId}/members`);
      setMembers(data);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to load members", "error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onToast]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleRemove = async (userId: string) => {
    if (!confirm("Remove this member from the workspace?")) return;
    setRemoving(userId);
    try {
      await api(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" });
      onToast("Member removed", "success");
      await loadMembers();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to remove member", "error");
    } finally {
      setRemoving(null);
    }
  };

  const currentMember = members.find((m) => m.userId === currentUserId);
  const isAdmin = currentMember?.role === "admin";

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-4">
      {currentMember && (
        <p className="text-xs text-gray-500">
          Your role: <span className="font-medium text-black">{currentMember.role}</span>
        </p>
      )}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Name
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Email
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Role
              </th>
              {isAdmin && (
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-black">
                  {member.fullName ?? <span className="text-gray-400 italic">No name</span>}
                  {member.userId === currentUserId && (
                    <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{member.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    {member.userId !== currentUserId && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={removing === member.userId}
                        onClick={() => handleRemove(member.userId)}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No members found.</p>
        )}
      </div>
    </div>
  );
}

// ---- Invitations Tab ----
interface InvitationsTabProps {
  workspaceId: string;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function InvitationsTab({ workspaceId, onToast }: InvitationsTabProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviting, setInviting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Invitation[]>(`/api/workspaces/${workspaceId}/invitations`);
      setInvitations(data);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to load invitations", "error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onToast]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      onToast("Email is required", "error");
      return;
    }
    setInviting(true);
    try {
      await api(`/api/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      onToast("Invitation sent", "success");
      setInviteEmail("");
      await loadInvitations();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to send invitation", "error");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (invId: string) => {
    if (!confirm("Revoke this invitation?")) return;
    setRevoking(invId);
    try {
      await api(`/api/workspaces/${workspaceId}/invitations/${invId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "revoked" }),
      });
      onToast("Invitation revoked", "success");
      await loadInvitations();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to revoke invitation", "error");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="pt-4 space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-black">Invite Member</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Input
              label="Email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
            />
          </div>
          <div className="w-36">
            <Select
              label="Role"
              options={ROLE_OPTIONS}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            />
          </div>
          <Button onClick={handleInvite} loading={inviting} className="mb-0">
            Invite
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Email
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Role
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-black">{inv.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={roleBadgeVariant(inv.role)}>{inv.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={inviteStatusVariant(inv.status)}>{inv.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.status === "pending" && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={revoking === inv.id}
                        onClick={() => handleRevoke(inv.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invitations.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No invitations yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----
export function WorkspaceSettingsPage() {
  const { activeWorkspace, refresh } = useWorkspace();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("general");
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info") => {
      setToast({ message, type });
    },
    [],
  );

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Select a workspace to manage its settings.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-black">Workspace Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">{activeWorkspace.name}</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "general" && (
          <GeneralTab
            workspaceId={activeWorkspace.id}
            initial={{
              name: activeWorkspace.name,
              description: activeWorkspace.description ?? "",
              avatarColor: activeWorkspace.avatarColor ?? "#111111",
              avatarEmoji: activeWorkspace.avatarEmoji ?? "",
            }}
            onToast={showToast}
            onRefresh={refresh}
          />
        )}

        {activeTab === "team" && user && (
          <TeamTab
            workspaceId={activeWorkspace.id}
            currentUserId={user.id}
            onToast={showToast}
          />
        )}

        {activeTab === "invitations" && (
          <InvitationsTab workspaceId={activeWorkspace.id} onToast={showToast} />
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
