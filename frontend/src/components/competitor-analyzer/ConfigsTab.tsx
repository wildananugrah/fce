import { useState } from "react";
import { Plus, Settings2, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "../ui/Button";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import type { AnalysisConfig } from "../../services/competitor-analyzer.api";
import type { CompetitorAnalyzerStepKey } from "../../pages/CompetitorAnalyzerPage";
import { ConfigCard } from "./ConfigCard";
import { ConfigForm } from "./ConfigForm";
import { ConfigCreatorPicker } from "./ConfigCreatorPicker";

interface Props {
	ca: ReturnType<typeof useCompetitorAnalyzer>;
	onGoToStep: (key: CompetitorAnalyzerStepKey) => void;
}

export function ConfigsTab({ ca, onGoToStep }: Props) {
	const [editing, setEditing] = useState<AnalysisConfig | null>(null);
	const [creating, setCreating] = useState(false);
	const [pickerConfig, setPickerConfig] = useState<AnalysisConfig | null>(null);

	const hasCreators = ca.creators.length > 0;
	const hasConfigs = ca.configs.length > 0;
	const hasUsableConfigs = ca.configs.some((c) => (c.creators?.length ?? 0) > 0);

	async function handleSubmit(input: Parameters<typeof ca.saveConfig>[0]) {
		const saved = await ca.saveConfig(input);
		setEditing(null);
		setCreating(false);
		const fresh = ca.configs.find((c) => c.id === saved.id) ?? (saved as AnalysisConfig);
		setPickerConfig(fresh as AnalysisConfig);
		return saved;
	}

	// Hard dependency: no creators → a config can be saved but can't do anything useful.
	if (!hasCreators) {
		return (
			<div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
				<div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3">
					<Settings2 size={20} className="text-indigo-600" />
				</div>
				<p className="text-sm font-semibold text-gray-800">Add creators first</p>
				<p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
					A config picks from your creator roster. Add at least one competitor before creating a
					config.
				</p>
				<button
					type="button"
					onClick={() => onGoToStep("creators")}
					className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
				>
					<ArrowLeft size={14} />
					Back to Creators
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{!creating && !editing && (
				<div className="flex justify-end">
					<Button onClick={() => setCreating(true)}>
						<Plus size={14} className="mr-1" />
						New Config
					</Button>
				</div>
			)}

			{(creating || editing) && (
				<ConfigForm
					initial={editing}
					onSubmit={handleSubmit}
					onCancel={() => {
						setEditing(null);
						setCreating(false);
					}}
				/>
			)}

			{pickerConfig && (
				<div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
					<strong>Step 2 of 2:</strong> Pick which creators this config should analyze.
				</div>
			)}
			{pickerConfig && (
				<ConfigCreatorPicker
					creators={ca.creators}
					selectedIds={
						ca.configs.find((c) => c.id === pickerConfig.id)?.creators.map((c) => c.id) ?? []
					}
					onSave={async (ids) => {
						await ca.setConfigCreators(pickerConfig.id, ids);
						setPickerConfig(null);
					}}
				/>
			)}

			{!hasConfigs && !creating && (
				<div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-gray-300 rounded-xl bg-gray-50/50">
					<div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-3">
						<Settings2 size={20} className="text-indigo-600" />
					</div>
					<p className="text-sm font-semibold text-gray-800">No configs yet</p>
					<p className="text-xs text-gray-500 mt-1 text-center max-w-sm">
						A config tells the AI about your brand and how to analyze competitor videos. Create
						one — you'll assign creators to it next.
					</p>
					<button
						type="button"
						onClick={() => setCreating(true)}
						className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
					>
						<Plus size={14} />
						Create your first config
					</button>
				</div>
			)}

			{hasConfigs && (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					{ca.configs.map((config) => (
						<ConfigCard
							key={config.id}
							config={config}
							onEdit={(c) => setEditing(c)}
							onDelete={ca.removeConfig}
						/>
					))}
				</div>
			)}

			{hasUsableConfigs && !creating && !editing && !pickerConfig && (
				<div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between gap-4">
					<div className="min-w-0">
						<p className="text-sm font-semibold text-indigo-900">Ready for step 3?</p>
						<p className="text-xs text-indigo-700/80 mt-0.5">
							Launch a pipeline run — it scrapes recent videos, scores them with AI, and writes
							tailored scripts.
						</p>
					</div>
					<button
						type="button"
						onClick={() => onGoToStep("runs")}
						className="shrink-0 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
					>
						Run Pipeline
						<ArrowRight size={14} />
					</button>
				</div>
			)}
		</div>
	);
}
