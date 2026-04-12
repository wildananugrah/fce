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

  useEffect(() => {
    if (!workspaceId) return;
    const scopeParam = scope === "workspace" ? "&scope=workspace" : "";
    (async () => {
      try {
        const [summaryRes, dailyRes] = await Promise.all([
          api<{ data: TokenSummary }>(
            `/api/workspaces/${workspaceId}/ai-logs/usage?${scopeParam.slice(1)}`,
          ),
          api<{ data: DailyPoint[] }>(
            `/api/workspaces/${workspaceId}/ai-logs/usage/daily?days=${days}${scopeParam}`,
          ),
        ]);
        setSummary((summaryRes as any).data ?? summaryRes);
        setDaily((dailyRes as any).data ?? dailyRes);
      } catch {
        // silent
      }
    })();
  }, [workspaceId, scope, days]);

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">{title}</h2>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>

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
