import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import { CreatorAddForm } from "./CreatorAddForm";
import { CreatorCard } from "./CreatorCard";
import { CreatorsEmptyState } from "./CreatorsEmptyState";

export function CreatorsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return (
		<div className="space-y-4">
			<CreatorAddForm onSubmit={async (input) => {
				await ca.addCreator(input);
			}} />

			{ca.creators.length === 0 ? (
				<CreatorsEmptyState />
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{ca.creators.map((creator) => (
						<CreatorCard
							key={creator.id}
							creator={creator}
							onArchive={ca.archiveCreator}
							onRetryEnrichment={ca.retryCreatorEnrichment}
						/>
					))}
				</div>
			)}
		</div>
	);
}
