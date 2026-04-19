import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface Props {
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
  onCreated: () => void | Promise<void>;
}

export function AdminNewUserModal({ onClose, onToast, onCreated }: Props) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 8) {
      onToast("Email and a password of 8+ characters are required", "error");
      return;
    }
    setSaving(true);
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim() || undefined,
          password,
          isSuperadmin,
        }),
      });
      onToast("User created", "success");
      await onCreated();
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to create user", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New User" size="md">
      <div className="space-y-4">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Full name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input
          label="Temporary password"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="min 8 characters"
        />
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isSuperadmin}
            onChange={(e) => setIsSuperadmin(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">Grant superadmin on creation</span>
        </label>
        <p className="text-[11px] text-gray-500">
          The user will still need to be added to a workspace + project separately before they can use the app.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={saving}>
            Create user
          </Button>
        </div>
      </div>
    </Modal>
  );
}
