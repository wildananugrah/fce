import { useEffect, useState } from "react";
import { ShieldOff, Plus, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Tabs } from "../components/ui/Tabs";
import { Table } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { AdminNewUserModal } from "../components/admin/AdminNewUserModal";
import { AdminUserModal } from "../components/admin/AdminUserModal";
import { CoachMark } from "../components/onboarding/CoachMark";
import { HelpButton } from "../components/onboarding/HelpButton";

interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  isSuperadmin: boolean;
  createdAt: string;
  [key: string]: unknown;
}

interface TaxonomyItem {
  id: string;
  name: string;
  description: string | null;
  [key: string]: unknown;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  user: { email: string; fullName: string | null };
  [key: string]: unknown;
}

const TABS = [
  { key: "users", label: "Users" },
  { key: "frameworks", label: "Frameworks" },
  { key: "hook-types", label: "Hook Types" },
  { key: "tone-presets", label: "Tone Presets" },
  { key: "visual-styles", label: "Visual Styles" },
  { key: "audit-logs", label: "Audit Logs" },
];

const TAXONOMY_TABS = ["frameworks", "hook-types", "tone-presets", "visual-styles"];

export function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [taxonomyItems, setTaxonomyItems] = useState<TaxonomyItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Users tab — new / manage modals + toast
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [manageUserId, setManageUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (message: string, type: "success" | "error" | "info") => setToast({ message, type });

  if (!user?.isSuperadmin) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 text-red-600">
          <ShieldOff className="w-5 h-5 flex-shrink-0" />
          <div>
            <h1 className="text-lg font-semibold">Access Denied</h1>
            <p className="text-sm text-red-500 mt-0.5">
              You do not have permission to view this page. Superadmin access is required.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const fetchData = async (tab: string) => {
    setLoading(true);
    try {
      if (tab === "users") {
        const data = await api<AdminUser[]>("/api/admin/users");
        setUsers(data);
      } else if (tab === "audit-logs") {
        const data = await api<AuditLogEntry[]>("/api/admin/audit-logs");
        setAuditLogs(data);
      } else if (TAXONOMY_TABS.includes(tab)) {
        const data = await api<TaxonomyItem[]>(`/api/taxonomy/${tab}`);
        setTaxonomyItems(data);
      }
    } catch {
      // Silent fail - empty state will show
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  const handleAddTaxonomy = async () => {
    if (!newName.trim()) return;
    try {
      await api(`/api/admin/taxonomy/${activeTab}`, {
        method: "POST",
        body: JSON.stringify({ name: newName, description: newDescription || null }),
      });
      setShowAddModal(false);
      setNewName("");
      setNewDescription("");
      fetchData(activeTab);
    } catch {
      // Error handled silently
    }
  };

  const handleDeleteTaxonomy = async (id: string) => {
    try {
      await api(`/api/admin/taxonomy/${activeTab}/${id}`, { method: "DELETE" });
      fetchData(activeTab);
    } catch {
      // Error handled silently
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      );
    }

    if (activeTab === "users") {
      return (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setNewUserOpen(true)}>
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              New User
            </Button>
          </div>
          <Table<AdminUser>
            columns={[
              {
                key: "email",
                header: "Email",
                render: (u) => (
                  <button
                    type="button"
                    onClick={() => setManageUserId(u.id)}
                    className="text-left hover:text-indigo-600"
                  >
                    {u.email}
                  </button>
                ),
              },
              { key: "fullName", header: "Name", render: (u) => u.fullName || "-" },
              {
                key: "status",
                header: "Status",
                render: (u) => (
                  <Badge variant={u.status === "active" ? "success" : "warning"}>
                    {u.status}
                  </Badge>
                ),
              },
              {
                key: "isSuperadmin",
                header: "Role",
                render: (u) =>
                  u.isSuperadmin ? (
                    <Badge variant="info">Superadmin</Badge>
                  ) : (
                    <span className="text-gray-400 text-xs">User</span>
                  ),
              },
              {
                key: "createdAt",
                header: "Joined",
                render: (u) => new Date(u.createdAt).toLocaleDateString(),
              },
              {
                key: "actions",
                header: "",
                render: (u) => (
                  <Button size="sm" variant="secondary" onClick={() => setManageUserId(u.id)}>
                    Manage
                  </Button>
                ),
              },
            ]}
            data={users}
            emptyMessage="No users found"
          />
        </div>
      );
    }

    if (activeTab === "audit-logs") {
      return (
        <Table<AuditLogEntry>
          columns={[
            {
              key: "createdAt",
              header: "Date",
              render: (l) => new Date(l.createdAt).toLocaleString(),
            },
            {
              key: "user",
              header: "User",
              render: (l) => l.user?.email || "-",
            },
            { key: "action", header: "Action" },
            { key: "entityType", header: "Entity" },
          ]}
          data={auditLogs}
          emptyMessage="No audit logs found"
        />
      );
    }

    if (TAXONOMY_TABS.includes(activeTab)) {
      return (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add New
            </Button>
          </div>
          <Table<TaxonomyItem>
            columns={[
              { key: "name", header: "Name" },
              { key: "description", header: "Description", render: (i) => i.description || "-" },
              {
                key: "actions",
                header: "",
                render: (i) => (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTaxonomy(i.id);
                    }}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ),
              },
            ]}
            data={taxonomyItems}
            emptyMessage="No items found"
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-black">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage users, taxonomy data, and view audit logs.
          </p>
        </div>
        <HelpButton pageKey="admin" />
      </div>

      <CoachMark pageKey="admin" title="Admin" body="Superadmin-only tools for managing users, workspaces, and system-wide settings across all tenants on this instance." />

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {renderContent()}

      {newUserOpen && (
        <AdminNewUserModal
          onClose={() => setNewUserOpen(false)}
          onToast={showToast}
          onCreated={() => fetchData("users")}
        />
      )}

      {manageUserId && (
        <AdminUserModal
          userId={manageUserId}
          isSelf={user?.id === manageUserId}
          onClose={() => setManageUserId(null)}
          onToast={showToast}
          onChanged={() => fetchData("users")}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Item">
        <div className="space-y-4">
          <Input
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter name"
          />
          <Input
            label="Description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Enter description (optional)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddTaxonomy}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
