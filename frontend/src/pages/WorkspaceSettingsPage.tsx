import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { researchApi } from "../services/research.service";
import { useWorkspace } from "../hooks/useWorkspace";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Tabs } from "../components/ui/Tabs";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { TokenUsageSection } from "../components/token-usage/TokenUsageSection";
import { AiProvidersSection } from "../components/workspace-settings/AiProvidersSection";
import { SkillsTab } from "../components/workspace-settings/SkillsTab";

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
  { key: "skills", label: "AI Skills" },
  { key: "usage", label: "Token Usage" },
  { key: "integrations", label: "Integrations" },
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
  workspaceName: string;
  initial: {
    name: string;
    description: string;
    avatarColor: string;
    avatarEmoji: string;
  };
  onToast: (msg: string, type: "success" | "error" | "info") => void;
  onRefresh: () => Promise<void>;
  onDeleted: () => void;
}

function GeneralTab({ workspaceId, workspaceName, initial, onToast, onRefresh, onDeleted }: GeneralTabProps) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [avatarColor, setAvatarColor] = useState(initial.avatarColor);
  const [avatarEmoji, setAvatarEmoji] = useState(initial.avatarEmoji);
  const [saving, setSaving] = useState(false);

  // Delete workspace state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to delete workspace", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Profile Section */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Profile</h2>
        <p className="text-xs text-gray-500 mb-4">Basic information about this workspace.</p>
        <div className="space-y-4">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                Avatar Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={avatarColor}
                  onChange={(e) => setAvatarColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-200"
                />
                <span className="text-xs text-gray-500 font-mono">{avatarColor}</span>
              </div>
            </div>
            <Input
              label="Avatar Emoji"
              value={avatarEmoji}
              onChange={(e) => setAvatarEmoji(e.target.value)}
              placeholder="🚀"
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} loading={saving}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="pt-6 border-t border-gray-200">
        <h2 className="text-sm font-semibold text-red-600 mb-1">Danger Zone</h2>
        <p className="text-xs text-gray-500 mb-4">
          Permanently delete this workspace and all of its data.
        </p>
        <div className="flex items-center justify-between p-4 border border-red-200 bg-red-50/30 rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-900">Delete workspace</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Removes brands, products, topics, content, and campaigns. Cannot be undone.
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
            Delete
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          isOpen
          onClose={() => { setShowDeleteModal(false); setDeleteConfirmName(""); }}
          title="Delete Workspace"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This will permanently delete <span className="font-semibold text-gray-900">{workspaceName}</span> and
              all its data including brands, products, topics, content, and campaigns. This action cannot be undone.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Type <span className="font-semibold text-gray-900">{workspaceName}</span> to confirm
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={workspaceName}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmName(""); }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                loading={deleting}
                disabled={deleteConfirmName !== workspaceName}
              >
                Delete Workspace
              </Button>
            </div>
          </div>
        </Modal>
      )}
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
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Team Members</h2>
        <p className="text-xs text-gray-500">
          {currentMember ? (
            <>Your role: <span className="font-medium text-gray-700 capitalize">{currentMember.role}</span></>
          ) : (
            "Members with access to this workspace."
          )}
        </p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
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
  const [resendingId, setResendingId] = useState<string | null>(null);

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

  const handleResend = async (invId: string) => {
    setResendingId(invId);
    try {
      await api(`/api/workspaces/${workspaceId}/invitations/${invId}/resend`, {
        method: "POST",
      });
      onToast("Invitation email sent again", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to resend invitation", "error");
    } finally {
      setResendingId(null);
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
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Invite Member</h2>
        <p className="text-xs text-gray-500 mb-4">Send an invitation to join this workspace.</p>
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

      <div className="pt-4 border-t border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Sent Invitations</h2>
        <p className="text-xs text-gray-500 mb-4">All invitations sent for this workspace.</p>
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
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResend(inv.id)}
                          loading={resendingId === inv.id}
                        >
                          Resend
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRevoke(inv.id)}
                          loading={revoking === inv.id}
                        >
                          Revoke
                        </Button>
                      </div>
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

// ---- Integrations Tab ----
interface IntegrationsTabProps {
  workspaceId: string;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

function IntegrationsTab({ workspaceId, showToast }: IntegrationsTabProps) {
  return (
    <div className="space-y-10">
      <AiProvidersSection workspaceId={workspaceId} showToast={showToast} />
      <div className="border-t border-gray-200" />
      <ApifyIntegrationSection workspaceId={workspaceId} showToast={showToast} />
    </div>
  );
}

function ApifyIntegrationSection({ workspaceId, showToast }: IntegrationsTabProps) {
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    researchApi.getSettings(workspaceId).then((s) => {
      setHasKey(s.hasApifyKey);
      setMaskedKey(s.maskedKey || "");
      setLoading(false);
    });
  }, [workspaceId]);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await researchApi.setApifyKey(workspaceId, apiKey.trim());
      const s = await researchApi.getSettings(workspaceId);
      setHasKey(s.hasApifyKey);
      setMaskedKey(s.maskedKey || "");
      setApiKey("");
      setTestResult(null);
      showToast("Apify API key saved", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { connected } = await researchApi.testApifyKey(workspaceId);
      setTestResult(connected);
      showToast(connected ? "Connected to Apify!" : "Connection failed \u2014 check your key", connected ? "success" : "error");
    } catch (e) {
      setTestResult(false);
      showToast("Connection test failed", "error");
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    try {
      await researchApi.removeApifyKey(workspaceId);
      setHasKey(false);
      setMaskedKey("");
      setTestResult(null);
      showToast("Apify API key removed", "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to remove", "error");
    }
  };

  if (loading) return <Spinner size="sm" />;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Apify</h2>
        <p className="text-xs text-gray-500 mb-4">
          Connect your Apify account to enable competitor research and enhanced brand scraping.
        </p>

        {hasKey ? (
          <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 font-mono">
                {maskedKey}
              </div>
              <Badge variant="success">Connected</Badge>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={handleTest} loading={testing}>
                Test Connection
              </Button>
              <Button size="sm" variant="danger" onClick={handleRemove}>Remove</Button>
            </div>
            {testResult === true && <p className="text-xs text-green-600">Connection successful</p>}
            {testResult === false && <p className="text-xs text-red-600">Connection failed</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="apify_api_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <Button size="sm" onClick={handleSave} loading={saving} disabled={!apiKey.trim()}>
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main Page ----
export function WorkspaceSettingsPage() {
  const { activeWorkspace, refresh } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("general");
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info") => {
      setToast({ message, type });
    },
    [],
  );

  const handleWorkspaceDeleted = useCallback(async () => {
    localStorage.removeItem("activeWorkspaceId");
    await refresh();
    navigate("/dashboard");
  }, [refresh, navigate]);

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Select a workspace to manage its settings.</p>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Workspace Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage <span className="font-medium text-gray-700">{activeWorkspace.name}</span> settings, team, and integrations.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "general" && (
          <GeneralTab
            workspaceId={activeWorkspace.id}
            workspaceName={activeWorkspace.name}
            initial={{
              name: activeWorkspace.name,
              description: activeWorkspace.description ?? "",
              avatarColor: activeWorkspace.avatarColor ?? "#111111",
              avatarEmoji: activeWorkspace.avatarEmoji ?? "",
            }}
            onToast={showToast}
            onRefresh={refresh}
            onDeleted={handleWorkspaceDeleted}
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

        {activeTab === "skills" && (
          <SkillsTab workspaceId={activeWorkspace.id} onToast={showToast} />
        )}

        {activeTab === "usage" && (
          <TokenUsageSection
            workspaceId={activeWorkspace.id}
            scope="workspace"
            title="Workspace Token Usage"
            description={`Total tokens consumed by all members in ${activeWorkspace.name}.`}
          />
        )}

        {activeTab === "integrations" && activeWorkspace && (
          <IntegrationsTab
            workspaceId={activeWorkspace.id}
            showToast={(msg, type) => setToast({ message: msg, type })}
          />
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
