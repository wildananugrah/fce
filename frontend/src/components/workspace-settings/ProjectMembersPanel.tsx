import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { SearchableSelect } from "../ui/SearchableSelect";
import { ALL_MENU_KEYS, type MenuKey } from "../../contexts/ProjectContext";

interface Membership {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
  isApprover: boolean;
  menuAccess: MenuKey[];
  createdAt: string;
}

interface WorkspaceMember {
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
}

interface Props {
  workspaceId: string;
  projectId: string;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
  /** Called when a membership changes so the parent list can refresh counts. */
  onChanged?: () => void;
}

const MENU_LABELS: Record<MenuKey, string> = {
  "brand-brain": "Brand Brain",
  "product-brain": "Product Brain",
  "topic-generator": "Topic Generator",
  "content-generator": "Content Generator",
  "campaign-generator": "Campaign Generator",
  "topic-library": "Topic Library",
  "content-library": "Content Library",
  "learning-center": "Learning Center",
  "research-hub": "Research Hub",
};

export function ProjectMembersPanel({ workspaceId, projectId, onToast, onChanged }: Props) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, ws] = await Promise.all([
        api<Membership[]>(`/api/workspaces/${workspaceId}/projects/${projectId}/members`),
        api<WorkspaceMember[]>(`/api/workspaces/${workspaceId}/members`),
      ]);
      setMemberships(m);
      setWorkspaceMembers(ws);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to load members", "error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectId, onToast]);

  useEffect(() => { load(); }, [load]);

  const memberIdsInProject = useMemo(
    () => new Set(memberships.map((m) => m.userId)),
    [memberships],
  );
  const availableToAdd = workspaceMembers.filter((wm) => !memberIdsInProject.has(wm.userId));

  const patchMembership = async (
    userId: string,
    patch: { isApprover?: boolean; menuAccess?: MenuKey[] },
  ) => {
    setSavingUserId(userId);
    try {
      await api(
        `/api/workspaces/${workspaceId}/projects/${projectId}/members/${userId}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      await load();
      onChanged?.();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to update member", "error");
    } finally {
      setSavingUserId(null);
    }
  };

  const removeMember = async (m: Membership) => {
    if (!confirm(`Remove ${m.user.email} from this project?`)) return;
    try {
      await api(
        `/api/workspaces/${workspaceId}/projects/${projectId}/members/${m.userId}`,
        { method: "DELETE" },
      );
      onToast("Member removed", "info");
      await load();
      onChanged?.();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to remove member", "error");
    }
  };

  const toggleMenu = (m: Membership, key: MenuKey) => {
    const next = m.menuAccess.includes(key)
      ? m.menuAccess.filter((k) => k !== key)
      : [...m.menuAccess, key];
    patchMembership(m.userId, { menuAccess: next });
  };

  if (loading) return <div className="py-10 flex justify-center"><Spinner size="sm" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Members ({memberships.length})
        </h3>
        <Button
          size="sm"
          disabled={availableToAdd.length === 0}
          onClick={() => setAddOpen(true)}
        >
          <UserPlus size={12} className="mr-1.5" />
          Add member
        </Button>
      </div>

      {addOpen && (
        <AddMemberPopover
          candidates={availableToAdd}
          onCancel={() => setAddOpen(false)}
          onAdd={async (userId, isApprover, menuAccess) => {
            try {
              await api(`/api/workspaces/${workspaceId}/projects/${projectId}/members`, {
                method: "POST",
                body: JSON.stringify({ userId, isApprover, menuAccess }),
              });
              onToast("Member added", "success");
              setAddOpen(false);
              await load();
              onChanged?.();
            } catch (e) {
              onToast(e instanceof Error ? e.message : "Failed to add member", "error");
            }
          }}
        />
      )}

      {memberships.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No members yet.</p>
      ) : (
        <div className="space-y-3">
          {memberships.map((m) => (
            <div key={m.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {m.user.fullName || m.user.email}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{m.user.email}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.isApprover}
                      disabled={savingUserId === m.userId}
                      onChange={(e) =>
                        patchMembership(m.userId, { isApprover: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Approver
                  </label>
                  <button
                    type="button"
                    onClick={() => removeMember(m)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="Remove member"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                  Menu access
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_MENU_KEYS.map((key) => {
                    const on = m.menuAccess.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={savingUserId === m.userId}
                        onClick={() => toggleMenu(m, key)}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                          on
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        {MENU_LABELS[key]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddMemberPopover({
  candidates,
  onCancel,
  onAdd,
}: {
  candidates: WorkspaceMember[];
  onCancel: () => void;
  onAdd: (userId: string, isApprover: boolean, menuAccess: MenuKey[]) => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(candidates[0]?.userId ?? "");
  const [isApprover, setIsApprover] = useState(false);
  const [menus, setMenus] = useState<MenuKey[]>([...ALL_MENU_KEYS]);

  const toggle = (key: MenuKey) => {
    setMenus((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">Add member</h4>
      <SearchableSelect
        label="User"
        options={candidates.map((c) => ({
          value: c.userId,
          label: c.fullName || c.email,
          sublabel: c.fullName ? c.email : undefined,
        }))}
        value={selectedId}
        onChange={setSelectedId}
        placeholder="Search by name or email..."
      />

      <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={isApprover}
          onChange={(e) => setIsApprover(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        Approver (can change topic / content status)
      </label>

      <div>
        <p className="text-[11px] font-medium text-gray-600 uppercase tracking-wide mb-1.5">
          Menu access
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_MENU_KEYS.map((key) => {
            const on = menus.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                  on
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          disabled={!selectedId}
          onClick={() => onAdd(selectedId, isApprover, menus)}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
