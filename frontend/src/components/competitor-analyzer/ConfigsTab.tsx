import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";

export function ConfigsTab({ ca: _ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return <div className="text-sm text-gray-500">Configs tab — built in Phase 9.</div>;
}
