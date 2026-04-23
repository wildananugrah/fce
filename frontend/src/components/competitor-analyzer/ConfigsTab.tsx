import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../ui/Button";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import type { AnalysisConfig } from "../../services/competitor-analyzer.api";
import { ConfigCard } from "./ConfigCard";
import { ConfigForm } from "./ConfigForm";
import { ConfigCreatorPicker } from "./ConfigCreatorPicker";

export function ConfigsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	const [editing, setEditing] = useState<AnalysisConfig | null>(null);
	const [creating, setCreating] = useState(false);
	const [pickerConfig, setPickerConfig] = useState<AnalysisConfig | null>(null);

	async function handleSubmit(input: Parameters<typeof ca.saveConfig>[0]) {
		const saved = await ca.saveConfig(input);
		setEditing(null);
		setCreating(false);
		// After create/edit, open the picker step using the freshest config from state.
		const fresh = ca.configs.find((c) => c.id === saved.id) ?? (saved as AnalysisConfig);
		setPickerConfig(fresh as AnalysisConfig);
		return saved;
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

			{ca.configs.length === 0 && !creating && (
				<div className="py-12 text-center text-sm text-gray-500 border border-dashed border-gray-300 rounded-md">
					No configs yet. Click "New Config" to get started.
				</div>
			)}

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
		</div>
	);
}
