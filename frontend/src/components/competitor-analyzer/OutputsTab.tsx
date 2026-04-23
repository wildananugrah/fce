import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";

export function OutputsTab({ ca: _ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return <div className="text-sm text-gray-500">Outputs tab — built in Phase 11.</div>;
}
