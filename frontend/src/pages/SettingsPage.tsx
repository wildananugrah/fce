import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <h1 className="text-lg font-semibold text-black">Settings</h1>

      <Card className="p-6 space-y-4">
        <h2 className="text-sm font-semibold text-black">Profile</h2>

        <Input
          label="Full Name"
          value={user?.fullName ?? ""}
          readOnly
          disabled
          className="bg-gray-50 cursor-not-allowed"
        />

        <Input
          label="Email"
          value={user?.email ?? ""}
          readOnly
          disabled
          className="bg-gray-50 cursor-not-allowed"
        />

        <Input
          label="Avatar URL"
          value={user?.avatarUrl ?? ""}
          readOnly
          disabled
          placeholder="No avatar set"
          className="bg-gray-50 cursor-not-allowed"
        />

        <p className="text-xs text-gray-400">
          Profile editing is not available yet. Contact support to update your details.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-black mb-3">Account</h2>
        <Button variant="danger" onClick={handleLogout}>
          Log out
        </Button>
      </Card>
    </div>
  );
}
