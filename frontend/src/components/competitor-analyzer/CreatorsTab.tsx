import { ArrowRight } from "lucide-react";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import type { CompetitorAnalyzerStepKey } from "../../pages/CompetitorAnalyzerPage";
import { CreatorAddForm } from "./CreatorAddForm";
import { CreatorCard } from "./CreatorCard";
import { CreatorsEmptyState } from "./CreatorsEmptyState";

interface Props {
	ca: ReturnType<typeof useCompetitorAnalyzer>;
	onGoToStep: (key: CompetitorAnalyzerStepKey) => void;
}

export function CreatorsTab({ ca, onGoToStep }: Props) {
	const hasCreators = ca.creators.length > 0;

	return (
		<div className="space-y-4">
			<CreatorAddForm
				onSubmit={async (input) => {
					await ca.addCreator(input);
				}}
			/>

			{!hasCreators ? (
				<CreatorsEmptyState />
			) : (
				<>
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

					<NextStepCard
						title="Ready for step 2?"
						body="Create an analysis config — the blueprint the AI uses to score videos and write scripts."
						cta="Go to Configs"
						onClick={() => onGoToStep("configs")}
					/>
				</>
			)}
		</div>
	);
}

function NextStepCard({
	title,
	body,
	cta,
	onClick,
}: {
	title: string;
	body: string;
	cta: string;
	onClick: () => void;
}) {
	return (
		<div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between gap-4">
			<div className="min-w-0">
				<p className="text-sm font-semibold text-indigo-900">{title}</p>
				<p className="text-xs text-indigo-700/80 mt-0.5">{body}</p>
			</div>
			<button
				type="button"
				onClick={onClick}
				className="shrink-0 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
			>
				{cta}
				<ArrowRight size={14} />
			</button>
		</div>
	);
}
