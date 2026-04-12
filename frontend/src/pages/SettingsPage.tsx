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
  const [dailyUsage, setDailyUsage] = useState<Array<{
    date: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    count: number;
  }>>([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!activeWorkspace) return;
    (async () => {
      try {
        const [summaryRes, dailyRes] = await Promise.all([
          api<{ data: any }>(`/api/workspaces/${activeWorkspace.id}/ai-logs/usage`),
          api<{ data: any }>(`/api/workspaces/${activeWorkspace.id}/ai-logs/usage/daily?days=${days}`),
        ]);
        setTokenUsage((summaryRes as any).data ?? summaryRes);
        setDailyUsage((dailyRes as any).data ?? dailyRes);
      } catch {
        // silent
      }
    })();
  }, [activeWorkspace, days]);

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
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>

      <div className="space-y-4 max-w-lg">
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
          <div className="grid grid-cols-4 gap-3 max-w-2xl">
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

      {/* Daily Usage Chart */}
      <div className="mt-6 max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Daily Token Usage
          </h3>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                  days === d
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <UsageChart data={dailyUsage} />
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

// ─── Usage Chart Component ──────────────────────────────────────
interface DailyPoint {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  count: number;
}

function UsageChart({ data }: { data: DailyPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-10">No usage data yet</p>;
  }

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxTokens = Math.max(1, ...data.map((d) => d.totalTokens));
  const stepX = chartW / Math.max(1, data.length - 1);

  const pointX = (i: number) => padding.left + i * stepX;
  const pointY = (v: number) => padding.top + chartH - (v / maxTokens) * chartH;

  // Build line paths
  const totalPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${pointX(i)} ${pointY(d.totalTokens)}`)
    .join(" ");
  const inputPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${pointX(i)} ${pointY(d.inputTokens)}`)
    .join(" ");
  const outputPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${pointX(i)} ${pointY(d.outputTokens)}`)
    .join(" ");

  // Area under total line
  const areaPath = `${totalPath} L ${pointX(data.length - 1)} ${padding.top + chartH} L ${pointX(0)} ${padding.top + chartH} Z`;

  // Y-axis labels
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = (maxTokens / yTicks) * (yTicks - i);
    return { value: Math.round(value), y: padding.top + (chartH / yTicks) * i };
  });

  // X-axis labels — show ~5 evenly spaced dates
  const xLabelStep = Math.max(1, Math.floor(data.length / 5));

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-indigo-600" />
          <span>Total</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-sky-400" />
          <span>Input</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-emerald-400" />
          <span>Output</span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Grid lines */}
          {yLabels.map((tick, i) => (
            <line
              key={i}
              x1={padding.left}
              y1={tick.y}
              x2={padding.left + chartW}
              y2={tick.y}
              stroke="#f3f4f6"
              strokeWidth={1}
            />
          ))}

          {/* Y-axis labels */}
          {yLabels.map((tick, i) => (
            <text
              key={i}
              x={padding.left - 6}
              y={tick.y + 3}
              fontSize={9}
              fill="#9ca3af"
              textAnchor="end"
            >
              {tick.value >= 1000 ? `${(tick.value / 1000).toFixed(1)}k` : tick.value}
            </text>
          ))}

          {/* X-axis labels */}
          {data.map((d, i) =>
            i % xLabelStep === 0 ? (
              <text
                key={i}
                x={pointX(i)}
                y={padding.top + chartH + 16}
                fontSize={9}
                fill="#9ca3af"
                textAnchor="middle"
              >
                {d.date.slice(5)}
              </text>
            ) : null,
          )}

          {/* Area fill */}
          <path d={areaPath} fill="url(#gradient)" opacity={0.1} />
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Lines */}
          <path d={inputPath} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
          <path d={outputPath} fill="none" stroke="#34d399" strokeWidth={1.5} />
          <path d={totalPath} fill="none" stroke="#4f46e5" strokeWidth={2} />

          {/* Hover points */}
          {data.map((_, i) => (
            <rect
              key={i}
              x={pointX(i) - stepX / 2}
              y={padding.top}
              width={stepX}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          ))}
          {hoverIdx !== null && (
            <>
              <line
                x1={pointX(hoverIdx)}
                y1={padding.top}
                x2={pointX(hoverIdx)}
                y2={padding.top + chartH}
                stroke="#d1d5db"
                strokeDasharray="2 2"
              />
              <circle cx={pointX(hoverIdx)} cy={pointY(data[hoverIdx].totalTokens)} r={3} fill="#4f46e5" />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hoverIdx !== null && (
          <div
            className="absolute bg-gray-900 text-white text-[10px] px-2 py-1.5 rounded pointer-events-none whitespace-nowrap"
            style={{
              left: `${(pointX(hoverIdx) / width) * 100}%`,
              top: `${(pointY(data[hoverIdx].totalTokens) / height) * 100}%`,
              transform: "translate(-50%, -120%)",
            }}
          >
            <div className="font-semibold">{data[hoverIdx].date}</div>
            <div>Total: {data[hoverIdx].totalTokens.toLocaleString()}</div>
            <div>Input: {data[hoverIdx].inputTokens.toLocaleString()}</div>
            <div>Output: {data[hoverIdx].outputTokens.toLocaleString()}</div>
            <div>{data[hoverIdx].count} gen{data[hoverIdx].count !== 1 ? "s" : ""}</div>
          </div>
        )}
      </div>
    </div>
  );
}
