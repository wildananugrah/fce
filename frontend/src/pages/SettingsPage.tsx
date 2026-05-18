import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { TokenUsageSection } from "../components/token-usage/TokenUsageSection";
import type { ScrapeLanguage } from "../types";

const labelCls = "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const inputCls = "block w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none disabled:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60";

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [defaultScrapeLanguage, setDefaultScrapeLanguage] = useState<ScrapeLanguage>(
    user?.defaultScrapeLanguage ?? "indonesian",
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, avatarUrl, defaultScrapeLanguage }),
      });
      await refreshUser();
      setToast({ message: "Profile updated successfully", type: "success" });
    } catch (err) {
      console.error("Failed to update profile", err);
      setToast({ message: "Failed to update profile", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Profile Info</h2>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} value={user?.email || ""} disabled />
          </div>
          <div>
            <label className={labelCls}>Full Name</label>
            <input
              className={inputCls}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <div>
            <label className={labelCls}>Avatar URL</label>
            <input
              className={inputCls}
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </div>
          <div>
            <label className={labelCls}>Default auto-fill language</label>
            <select
              className={inputCls}
              value={defaultScrapeLanguage}
              onChange={(e) => setDefaultScrapeLanguage(e.target.value as ScrapeLanguage)}
            >
              <option value="indonesian">Bahasa Indonesia</option>
              <option value="english">English</option>
            </select>
            <p className="text-xs text-gray-500 mt-1.5">
              Controls the language used when auto-filling brand and product forms from a URL. You can
              still override this per click using the toggle next to each Auto-fill button.
            </p>
          </div>

          <Button size="sm" onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
        </div>

        {activeWorkspace && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <TokenUsageSection
              workspaceId={activeWorkspace.id}
              scope="user"
              title="Your Token Usage"
              description={`Tokens consumed by your generations in ${activeWorkspace.name}.`}
            />
          </div>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
