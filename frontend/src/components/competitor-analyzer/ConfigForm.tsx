import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { AnalysisConfig } from "../../services/competitor-analyzer.api";

interface Props {
	initial?: AnalysisConfig | null;
	onSubmit: (input: {
		id?: string;
		name: string;
		targetNiche?: string;
		brandContext: string;
		analysisInstructions: string;
		outputPreferences: string;
	}) => Promise<AnalysisConfig>;
	onCancel: () => void;
}

export function ConfigForm({ initial, onSubmit, onCancel }: Props) {
	const [name, setName] = useState("");
	const [targetNiche, setTargetNiche] = useState("");
	const [brandContext, setBrandContext] = useState("");
	const [analysisInstructions, setAnalysisInstructions] = useState("");
	const [outputPreferences, setOutputPreferences] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		setName(initial?.name ?? "");
		setTargetNiche(initial?.targetNiche ?? "");
		setBrandContext(initial?.brandContext ?? "");
		setAnalysisInstructions(initial?.analysisInstructions ?? "");
		setOutputPreferences(initial?.outputPreferences ?? "");
		setError("");
	}, [initial]);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setError("");
		try {
			await onSubmit({
				id: initial?.id,
				name,
				targetNiche: targetNiche || undefined,
				brandContext,
				analysisInstructions,
				outputPreferences,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save config");
			setSubmitting(false);
			return;
		}
		setSubmitting(false);
	}

	return (
		<form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
				{initial ? "Edit config" : "New config"}
			</p>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				<Input label="Config Name" value={name} onChange={(e) => setName(e.target.value)} />
				<Input
					label="Target Niche"
					value={targetNiche}
					onChange={(e) => setTargetNiche(e.target.value)}
					placeholder="fitness, fashion, …"
				/>
			</div>
			<label className="block">
				<span className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
					Brand Context
				</span>
				<textarea
					className="w-full min-h-[64px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					value={brandContext}
					onChange={(e) => setBrandContext(e.target.value)}
					placeholder="Who we are, what we sell, who we serve."
				/>
			</label>
			<label className="block">
				<span className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
					Analysis Instructions
				</span>
				<textarea
					className="w-full min-h-[64px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					value={analysisInstructions}
					onChange={(e) => setAnalysisInstructions(e.target.value)}
					placeholder='Analyze the hook, retention mechanisms, and CTA.'
				/>
			</label>
			<label className="block">
				<span className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
					Output Preferences
				</span>
				<textarea
					className="w-full min-h-[64px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					value={outputPreferences}
					onChange={(e) => setOutputPreferences(e.target.value)}
					placeholder='Generate 3 different script concepts with B-roll descriptions.'
				/>
			</label>
			{error && <p className="text-xs text-red-500">{error}</p>}
			<div className="flex justify-end gap-2">
				<Button type="button" variant="secondary" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" loading={submitting}>
					{initial ? "Save changes" : "Create config"}
				</Button>
			</div>
		</form>
	);
}
