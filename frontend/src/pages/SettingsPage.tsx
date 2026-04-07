import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Toast } from "../components/ui/Toast";

export function SettingsPage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, avatarUrl }),
      });
      setToast({ message: "Profile updated successfully", type: "success" });
    } catch {
      setToast({ message: "Failed to update profile", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>

      <div className="space-y-4">
        <Input label="Email" value={user?.email || ""} disabled />
        <Input
          label="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your full name"
        />
        <Input
          label="Avatar URL"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://example.com/avatar.png"
        />

        <Button onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
