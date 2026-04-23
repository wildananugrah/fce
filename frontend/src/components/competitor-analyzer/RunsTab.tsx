import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";

export function RunsTab({ ca: _ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return <div className="text-sm text-gray-500">Runs tab — built in Phase 10.</div>;
}
