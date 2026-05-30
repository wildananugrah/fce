import { useState, useEffect } from "react";
import { api } from "../../services/api";

interface TokenSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  generationCount: number;
}

interface DailyPoint {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  count: number;
}

interface UserUsage {
  userId: string;
  email: string;
  fullName: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  generationCount: number;
}

interface CreditBalance {
  isOpenRouter: boolean;
  isUnlimited?: boolean;
  limit?: number;
  used?: number;
  remaining?: number;
  error?: string;
}

interface TokenUsageSectionProps {
  workspaceId: string;
  scope: "user" | "workspace";
  title?: string;
  description?: string;
}

export function TokenUsageSection({
  workspaceId,
  scope,
  title = "Token Usage",
  description,
}: TokenUsageSectionProps) {
  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [days, setDays] = useState(30);
  const [users, setUsers] = useState<UserUsage[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);

  // Fetch OpenRouter credit balance once (workspace scope only)
  useEffect(() => {
    if (!workspaceId || scope !== "workspace") return;
    (async () => {
      try {
        const res = await api<{ data: CreditBalance }>(
          `/api/workspaces/${workspaceId}/ai-settings/credit-balance`,
        );
        const data = (res as any).data ?? res;
        if (data?.isOpenRouter) setCreditBalance(data);
      } catch {
        // silent — credit balance is best-effort
      }
    })();
  }, [workspaceId, scope]);

  // Fetch the user-breakdown list once (only for workspace scope)
  useEffect(() => {
    if (!workspaceId || scope !== "workspace") return;
    (async () => {
      try {
        const res = await api<{ data: UserUsage[] }>(
          `/api/workspaces/${workspaceId}/ai-logs/usage/by-user`,
        );
        setUsers((res as any).data ?? res);
      } catch {
        // silent
      }
    })();
  }, [workspaceId, scope]);

  // Fetch summary + daily (re-runs when user filter changes)
  useEffect(() => {
    if (!workspaceId) return;
    const params = new URLSearchParams();
    if (scope === "workspace") {
      params.set("scope", "workspace");
      if (selectedUserId) params.set("userId", selectedUserId);
    }
    const summaryQs = params.toString();
    const dailyParams = new URLSearchParams(params);
    dailyParams.set("days", String(days));
    const dailyQs = dailyParams.toString();

    (async () => {
      try {
        const [summaryRes, dailyRes] = await Promise.all([
          api<{ data: TokenSummary }>(
            `/api/workspaces/${workspaceId}/ai-logs/usage${summaryQs ? `?${summaryQs}` : ""}`,
          ),
          api<{ data: DailyPoint[] }>(
            `/api/workspaces/${workspaceId}/ai-logs/usage/daily?${dailyQs}`,
          ),
        ]);
        setSummary((summaryRes as any).data ?? summaryRes);
        setDaily((dailyRes as any).data ?? dailyRes);
      } catch {
        // silent
      }
    })();
  }, [workspaceId, scope, days, selectedUserId]);

  const formatUserLabel = (u: UserUsage) => {
    const name = u.fullName ?? u.email;
    return `${name} — ${u.totalTokens.toLocaleString()} tokens`;
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">{title}</h2>
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
        {scope === "workspace" && users.length > 0 && (
          <div className="shrink-0">
            <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">
              Filter by user
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 min-w-[220px]"
            >
              <option value="">All users ({users.length})</option>
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {formatUserLabel(u)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* OpenRouter credit balance */}
      {creditBalance && <CreditBalanceCard balance={creditBalance} />}

      {/* Stat cards */}
      {summary ? (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Input Tokens" value={summary.totalInputTokens} />
          <StatCard label="Output Tokens" value={summary.totalOutputTokens} />
          <StatCard label="Total Tokens" value={summary.totalTokens} />
          <StatCard label="Generations" value={summary.generationCount} />
        </div>
      ) : (
        <p className="text-xs text-gray-400">Loading usage data...</p>
      )}

      {/* Daily chart */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
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
          <UsageChart data={daily} />
        </div>
      </div>

      {/* Per-user leaderboard (only for workspace scope, when no user filter applied) */}
      {scope === "workspace" && !selectedUserId && users.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Usage by Member
          </h3>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Member
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Input
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Output
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Total
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Generations
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.userId}
                    onClick={() => setSelectedUserId(u.userId)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <p className="text-sm text-gray-800 font-medium">{u.fullName ?? u.email}</p>
                      {u.fullName && <p className="text-[10px] text-gray-400">{u.email}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-600">
                      {u.inputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-600">
                      {u.outputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">
                      {u.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-600">
                      {u.generationCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CreditBalanceCard({ balance }: { balance: CreditBalance }) {
  if (balance.error) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-600">
        <span className="text-base">⚠️</span>
        <span>Could not fetch OpenRouter credit balance: {balance.error}</span>
      </div>
    );
  }

  if (balance.isUnlimited) {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
        <span className="text-base">✅</span>
        <div>
          <p className="text-xs font-semibold text-emerald-800">OpenRouter Credits</p>
          <p className="text-xs text-emerald-600">Unlimited key — no credit limit set</p>
        </div>
      </div>
    );
  }

  const remaining = balance.remaining ?? 0;
  const limit = balance.limit ?? 1;
  const pct = Math.max(0, Math.min(100, (remaining / limit) * 100));
  const isLow = pct < 20;
  const isCritical = pct < 5;

  return (
    <div className={`border rounded-lg px-4 py-3 ${isCritical ? "bg-red-50 border-red-200" : isLow ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{isCritical ? "🔴" : isLow ? "🟡" : "🟢"}</span>
          <p className="text-xs font-semibold text-gray-800">OpenRouter Credits</p>
        </div>
        <p className={`text-xs font-bold ${isCritical ? "text-red-600" : isLow ? "text-amber-700" : "text-gray-700"}`}>
          ${remaining.toFixed(2)} / ${limit.toFixed(2)} remaining
        </p>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${isCritical ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[10px] text-gray-400">Used: ${(balance.used ?? 0).toFixed(2)}</p>
        <p className={`text-[10px] font-medium ${isCritical ? "text-red-500" : isLow ? "text-amber-600" : "text-gray-400"}`}>
          {pct.toFixed(0)}% remaining
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

// ─── Usage Chart ──────────────────────────────────────
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

  const totalPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${pointX(i)} ${pointY(d.totalTokens)}`)
    .join(" ");
  const inputPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${pointX(i)} ${pointY(d.inputTokens)}`)
    .join(" ");
  const outputPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${pointX(i)} ${pointY(d.outputTokens)}`)
    .join(" ");

  const areaPath = `${totalPath} L ${pointX(data.length - 1)} ${padding.top + chartH} L ${pointX(0)} ${padding.top + chartH} Z`;

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = (maxTokens / yTicks) * (yTicks - i);
    return { value: Math.round(value), y: padding.top + (chartH / yTicks) * i };
  });

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

          <path d={areaPath} fill="url(#gradient-usage)" opacity={0.1} />
          <defs>
            <linearGradient id="gradient-usage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={inputPath} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
          <path d={outputPath} fill="none" stroke="#34d399" strokeWidth={1.5} />
          <path d={totalPath} fill="none" stroke="#4f46e5" strokeWidth={2} />

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
            <div>
              {data[hoverIdx].count} gen{data[hoverIdx].count !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
