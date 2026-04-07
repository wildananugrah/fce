import { useAuth } from "../hooks/useAuth";
import { ShieldOff, Users, Building2 } from "lucide-react";
import { Card } from "../components/ui/Card";

export function AdminPage() {
  const { user } = useAuth();

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-black">Admin</h1>
        <p className="text-sm text-gray-500 mt-0.5">Superadmin panel</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-6 flex items-start gap-4">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Users className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-black">User Management</h2>
            <p className="text-xs text-gray-500 mt-1">
              List and manage all users across the platform.
            </p>
            <p className="text-xs text-amber-600 mt-2 font-medium">Coming soon</p>
          </div>
        </Card>

        <Card className="p-6 flex items-start gap-4">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Building2 className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-black">Workspace Management</h2>
            <p className="text-xs text-gray-500 mt-1">
              View and manage all workspaces on the platform.
            </p>
            <p className="text-xs text-amber-600 mt-2 font-medium">Coming soon</p>
          </div>
        </Card>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">
          Admin panel — user and workspace management coming soon. Backend admin endpoints are
          currently being built.
        </p>
      </div>
    </div>
  );
}
