import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Toast } from "../components/ui/Toast";

export function SettingsPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCost: number;
    generationCount: number;
  } | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;
    (async () => {
      try {
        const res = await api<{ data: any }>(`/api/workspaces/${activeWorkspace.id}/ai-logs/usage`);
        const data = (res as any).data ?? res;
        setTokenUsage(data);
      } catch {
        // silent
      }
    })();
  }, [activeWorkspace]);

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

      {/* Token Usage */}
      <div className="mt-8 pt-8 border-t border-gray-200">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Token Usage</h2>
        {tokenUsage ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Input Tokens</p>
              <p className="text-lg font-semibold text-gray-900">{tokenUsage.totalInputTokens.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Output Tokens</p>
              <p className="text-lg font-semibold text-gray-900">{tokenUsage.totalOutputTokens.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Tokens</p>
              <p className="text-lg font-semibold text-gray-900">{tokenUsage.totalTokens.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Generations</p>
              <p className="text-lg font-semibold text-gray-900">{tokenUsage.generationCount.toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Loading usage data...</p>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
