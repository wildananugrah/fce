import { useSearchParams } from "react-router-dom";
import { useCompetitorAnalyzer } from "../hooks/useCompetitorAnalyzer";
import { CreatorsTab } from "../components/competitor-analyzer/CreatorsTab";
import { ConfigsTab } from "../components/competitor-analyzer/ConfigsTab";
import { RunsTab } from "../components/competitor-analyzer/RunsTab";
import { OutputsTab } from "../components/competitor-analyzer/OutputsTab";
import { Spinner } from "../components/ui/Spinner";

const TABS = [
	{ key: "creators", label: "Creators" },
	{ key: "configs", label: "Configs" },
	{ key: "runs", label: "Run Pipeline" },
	{ key: "outputs", label: "Outputs" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function CompetitorAnalyzerPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeTab = (searchParams.get("tab") as TabKey) || "creators";
	const ca = useCompetitorAnalyzer();

	function setTab(key: TabKey) {
		const next = new URLSearchParams(searchParams);
		next.set("tab", key);
		if (key !== "runs") next.delete("runId");
		setSearchParams(next, { replace: true });
	}

	if (!ca.ready) {
		return (
			<div className="p-8 text-center text-gray-500 text-sm">
				Select a workspace and project to use Competitor Analyzer.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<header>
				<h1 className="text-2xl font-semibold text-gray-900">Competitor Analyzer</h1>
				<p className="text-sm text-gray-500 mt-1">
					Scrape viral competitor videos, analyze their hooks and retention, and generate
					tailored scripts.
				</p>
			</header>

			<div className="border-b border-gray-200">
				<nav className="flex gap-6">
					{TABS.map((tab) => {
						const active = activeTab === tab.key;
						return (
							<button
								key={tab.key}
								type="button"
								onClick={() => setTab(tab.key)}
								className={`py-3 text-sm font-medium border-b-2 transition-colors ${
									active
										? "border-indigo-600 text-indigo-700"
										: "border-transparent text-gray-500 hover:text-gray-700"
								}`}
							>
								{tab.label}
							</button>
						);
					})}
				</nav>
			</div>

			{ca.loading && (
				<div className="py-12 flex justify-center">
					<Spinner size="lg" />
				</div>
			)}
			{ca.error && (
				<div className="rounded-md bg-red-50 text-red-700 text-sm px-4 py-2">{ca.error}</div>
			)}

			{!ca.loading && (
				<>
					{activeTab === "creators" && <CreatorsTab ca={ca} />}
					{activeTab === "configs" && <ConfigsTab ca={ca} />}
					{activeTab === "runs" && <RunsTab ca={ca} />}
					{activeTab === "outputs" && <OutputsTab ca={ca} />}
				</>
			)}
		</div>
	);
}
