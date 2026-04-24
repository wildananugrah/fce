import { useSearchParams } from "react-router-dom";
import { Users, Settings2, Play, FileText, Check, ChevronRight } from "lucide-react";
import { useCompetitorAnalyzer } from "../hooks/useCompetitorAnalyzer";
import { CreatorsTab } from "../components/competitor-analyzer/CreatorsTab";
import { ConfigsTab } from "../components/competitor-analyzer/ConfigsTab";
import { RunsTab } from "../components/competitor-analyzer/RunsTab";
import { OutputsTab } from "../components/competitor-analyzer/OutputsTab";
import { Spinner } from "../components/ui/Spinner";

const STEPS = [
	{ key: "creators", label: "Add Creators", icon: Users, blurb: "Pick TikTok accounts to study" },
	{ key: "configs", label: "Create Config", icon: Settings2, blurb: "Brand context + analysis rules" },
	{ key: "runs", label: "Run Pipeline", icon: Play, blurb: "Scrape → analyze → write scripts" },
	{ key: "outputs", label: "View Outputs", icon: FileText, blurb: "Generated scripts to use" },
] as const;

type TabKey = (typeof STEPS)[number]["key"];

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
			<div className="p-8 text-center text-sm text-gray-500">
				Select a workspace and project to use Competitor Analyzer.
			</div>
		);
	}

	const completedRuns = ca.runs.filter((r) => r.status === "completed").length;
	const configsWithCreators = ca.configs.filter((c) => (c.creators?.length ?? 0) > 0).length;

	const stepState: Record<TabKey, { count: number; done: boolean }> = {
		creators: { count: ca.creators.length, done: ca.creators.length > 0 },
		configs: { count: ca.configs.length, done: configsWithCreators > 0 },
		runs: { count: ca.runs.length, done: completedRuns > 0 },
		outputs: { count: completedRuns, done: completedRuns > 0 },
	};

	return (
		<div className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold text-gray-900">Competitor Analyzer</h1>
				<p className="mt-1 text-sm text-gray-500">
					Scrape viral competitor videos, score their hooks and retention, and generate tailored scripts — step by step.
				</p>
			</header>

			{/* Workflow stepper — replaces the flat tab bar so the canonical order is obvious. */}
			<nav aria-label="Workflow" className="bg-white border border-gray-200 rounded-xl p-2">
				<ol className="flex items-stretch gap-1 overflow-x-auto">
					{STEPS.map((step, i) => {
						const state = stepState[step.key];
						const isActive = activeTab === step.key;
						const Icon = step.icon;
						return (
							<li key={step.key} className="flex items-stretch gap-1 flex-1 min-w-0">
								<button
									type="button"
									onClick={() => setTab(step.key)}
									aria-current={isActive ? "step" : undefined}
									className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full min-w-0 text-left ${
										isActive
											? "bg-indigo-50 border border-indigo-200"
											: "border border-transparent hover:bg-gray-50"
									} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
								>
									<span
										className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold ${
											state.done
												? "bg-indigo-600 text-white"
												: isActive
													? "bg-white text-indigo-700 border border-indigo-300"
													: "bg-gray-100 text-gray-500"
										}`}
										aria-hidden
									>
										{state.done ? <Check size={14} /> : <Icon size={14} />}
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-1.5">
											<span
												className={`text-[10px] font-semibold uppercase tracking-wide ${
													isActive ? "text-indigo-700" : "text-gray-400"
												}`}
											>
												Step {i + 1}
											</span>
											<span
												className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
													state.done
														? "bg-indigo-100 text-indigo-700"
														: "bg-gray-100 text-gray-500"
												}`}
											>
												{state.count}
											</span>
										</span>
										<span
											className={`block text-sm font-semibold truncate ${
												isActive ? "text-indigo-900" : "text-gray-900"
											}`}
										>
											{step.label}
										</span>
										<span className="block text-[11px] text-gray-500 truncate">
											{step.blurb}
										</span>
									</span>
								</button>
								{i < STEPS.length - 1 && (
									<div aria-hidden className="self-center text-gray-300 shrink-0">
										<ChevronRight size={16} />
									</div>
								)}
							</li>
						);
					})}
				</ol>
			</nav>

			{ca.loading && (
				<div className="py-12 flex justify-center">
					<Spinner size="lg" />
				</div>
			)}
			{ca.error && (
				<div
					role="alert"
					className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2"
				>
					{ca.error}
				</div>
			)}

			{!ca.loading && (
				<>
					{activeTab === "creators" && <CreatorsTab ca={ca} onGoToStep={setTab} />}
					{activeTab === "configs" && <ConfigsTab ca={ca} onGoToStep={setTab} />}
					{activeTab === "runs" && <RunsTab ca={ca} onGoToStep={setTab} />}
					{activeTab === "outputs" && <OutputsTab ca={ca} onGoToStep={setTab} />}
				</>
			)}
		</div>
	);
}

export type CompetitorAnalyzerStepKey = TabKey;
