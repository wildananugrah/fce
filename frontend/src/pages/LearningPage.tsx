import { useEffect, useState } from "react";
import { BarChart2, Brain, TrendingUp, Zap } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";

interface Brand {
  id: string;
  name: string;
}

interface InsightItem {
  name: string;
  count: number;
}

interface RecommendationProfile {
  id: string;
  scopeType: string;
  scopeId: string;
  preferredFrameworks: InsightItem[] | null;
  preferredHooks: InsightItem[] | null;
  preferredTones: InsightItem[] | null;
  preferredVisualStyles: InsightItem[] | null;
  preferredPlatforms: InsightItem[] | null;
  commonEditPatterns: InsightItem[] | null;
  sampleSize: number;
  updatedAt: string;
}

function InsightBar({ items, label, icon }: { items: InsightItem[] | null; label: string; icon: React.ReactNode }) {
  if (!items || items.length === 0) {
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-black">{label}</h3>
        </div>
        <p className="text-xs text-gray-400">No data yet</p>
      </Card>
    );
  }

  const maxCount = Math.max(...items.map((i) => i.count));

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-black">{label}</h3>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-700">{item.name}</span>
              <span className="text-gray-400">{item.count}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-black rounded-full transition-all"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function LearningPage() {
  const { activeWorkspace } = useWorkspace();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [profile, setProfile] = useState<RecommendationProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [brandsLoading, setBrandsLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspace) {
      setBrandsLoading(false);
      return;
    }
    setBrandsLoading(true);
    api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands`)
      .then((data) => {
        setBrands(data);
        if (data.length > 0) setSelectedBrandId(data[0].id);
      })
      .catch(() => setBrands([]))
      .finally(() => setBrandsLoading(false));
  }, [activeWorkspace]);

  useEffect(() => {
    if (!activeWorkspace || !selectedBrandId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    api<RecommendationProfile | null>(
      `/api/workspaces/${activeWorkspace.id}/recommendations/brand/${selectedBrandId}`
    )
      .then((data) => setProfile(data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [activeWorkspace, selectedBrandId]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-black">Learning Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AI-powered insights based on your approved content and editing patterns.
          </p>
        </div>
      </div>

      {brandsLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : brands.length === 0 ? (
        <Card className="p-8 text-center">
          <Brain className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            No brands found. Create a brand first to see recommendation insights.
          </p>
        </Card>
      ) : (
        <>
          <div className="max-w-xs">
            <Select
              label="Brand"
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : !profile ? (
            <Card className="p-8 text-center">
              <TrendingUp className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                No recommendation data yet. Approve or reject generated content to build your
                brand's preference profile.
              </p>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Badge variant="default">
                  Sample Size: {profile.sampleSize} approved outputs
                </Badge>
                <span className="text-xs text-gray-400">
                  Last updated: {new Date(profile.updatedAt).toLocaleDateString()}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InsightBar
                  items={profile.preferredFrameworks}
                  label="Top Frameworks"
                  icon={<BarChart2 className="w-4 h-4 text-purple-600" />}
                />
                <InsightBar
                  items={profile.preferredHooks}
                  label="Top Hook Types"
                  icon={<Zap className="w-4 h-4 text-amber-600" />}
                />
                <InsightBar
                  items={profile.preferredPlatforms}
                  label="Top Platforms"
                  icon={<TrendingUp className="w-4 h-4 text-blue-600" />}
                />
                <InsightBar
                  items={profile.commonEditPatterns}
                  label="Common Edit Patterns"
                  icon={<Brain className="w-4 h-4 text-green-600" />}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
