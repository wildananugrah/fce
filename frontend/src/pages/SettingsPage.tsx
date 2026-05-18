import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";
import { useWorkspace } from "../hooks/useWorkspace";
import { api, ApiError } from "../services/api";
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

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    setChangingPassword(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setToast({ message: "Password changed successfully", type: "success" });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to change password";
      setPasswordError(msg);
    } finally {
      setChangingPassword(false);
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

        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Change Password</h2>
          {passwordError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {passwordError}
            </div>
          )}
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className={labelCls}>Current Password</label>
              <input
                type="password"
                className={inputCls}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
              />
            </div>
            <div>
              <label className={labelCls}>New Password</label>
              <input
                type="password"
                className={inputCls}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className={labelCls}>Confirm New Password</label>
              <input
                type="password"
                className={inputCls}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                minLength={8}
              />
            </div>
            <Button size="sm" type="submit" loading={changingPassword}>
              Change Password
            </Button>
          </form>
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
