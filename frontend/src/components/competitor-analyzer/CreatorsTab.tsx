import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";

export function CreatorsTab({ ca: _ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return <div className="text-sm text-gray-500">Creators tab — built in Phase 8.</div>;
}
