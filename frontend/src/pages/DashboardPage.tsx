import { useEffect, useState } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Badge } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import type { DashboardStats } from "../types";

export function DashboardPage() {
  const { activeWorkspace } = useWorkspace();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspace) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<DashboardStats>(`/api/workspaces/${activeWorkspace.id}/dashboard/stats`)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [activeWorkspace]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="text-4xl">🏢</div>
          <h2 className="text-lg font-semibold text-black">No workspace yet</h2>
          <p className="text-sm text-gray-500 max-w-sm">
            Create a workspace to get started. Click the <strong>"No workspace"</strong> dropdown in the sidebar, then select <strong>"Create workspace"</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return <div className="p-6 text-gray-500">Failed to load dashboard data.</div>;
  }

  const kpiCards = [
    { label: "Brands", value: stats.brandCount, color: "bg-blue-50 text-blue-700" },
    { label: "Products", value: stats.productCount, color: "bg-green-50 text-green-700" },
    { label: "Generations", value: stats.generationCount, color: "bg-purple-50 text-purple-700" },
    { label: "Campaigns", value: stats.campaignCount, color: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <div key={card.label} className={`rounded-lg p-4 ${card.color}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">{card.label}</p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Recent Generations</h2>
        {stats.recentGenerations.length === 0 ? (
          <p className="text-xs text-gray-400">No generations yet.</p>
        ) : (
          <div className="space-y-2">
            {stats.recentGenerations.map((gen) => (
              <div
                key={gen.id}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium capitalize">{gen.platform}</span>
                  <span className="text-xs text-gray-400">{gen.contentType.replace("_", " ")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      gen.status === "completed"
                        ? "success"
                        : gen.status === "failed"
                          ? "danger"
                          : "default"
                    }
                  >
                    {gen.status}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {new Date(gen.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
