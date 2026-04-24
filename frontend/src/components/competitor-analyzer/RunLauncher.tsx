import { useMemo, useState } from "react";
import { ArrowLeft, Clock, Play, Settings2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import type { CompetitorAnalyzerStepKey } from "../../pages/CompetitorAnalyzerPage";
import { PIPELINE_STAGES } from "./RunProgressBar";

interface Props {
	ca: ReturnType<typeof useCompetitorAnalyzer>;
	onLaunched: (runId: string) => void;
	onGoToStep: (key: CompetitorAnalyzerStepKey) => void;
}

export function RunLauncher({ ca, onLaunched, onGoToStep }: Props) {
	// Only configs that actually have creators can be run — hide the rest.
	const runnableConfigs = useMemo(
		() => ca.configs.filter((c) => (c.creators?.length ?? 0) > 0),
		[ca.configs],
	);

	const [configId, setConfigId] = useState<string>(runnableConfigs[0]?.id ?? "");
	const [videosPerCreator, setVideosPerCreator] = useState(3);
	const [lookbackPool, setLookbackPool] = useState(20);
	const [timeframeDays, setTimeframeDays] = useState(30);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	const hasActiveRunForConfig = ca.runs.some(
		(r) => r.configId === configId && !["completed", "failed"].includes(r.status),
	);

	const selectedConfig = runnableConfigs.find((c) => c.id === configId) ?? null;
	const estimatedVideos = selectedConfig
		? (selectedConfig.creators?.length ?? 0) * videosPerCreator
		: 0;

	async function handleLaunch() {
		if (!configId) {
			setError("Pick a config first");
			return;
		}
		setSubmitting(true);
		setError("");
		try {
			const run = await ca.launchRun({
				configId,
				videosPerCreator,
				lookbackPool,
				timeframeDays,
			});
			onLaunched(run.id);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Launch failed");
		} finally {
			setSubmitting(false);
		}
	}

	// Zero usable configs — block the form and send the user to the right place.
	if (runnableConfigs.length === 0) {
		return (
			<div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
				<div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3">
					<Settings2 size={20} className="text-indigo-600" />
				</div>
				<p className="text-sm font-semibold text-gray-800">
					{ca.configs.length === 0 ? "No configs yet" : "Your configs have no creators"}
				</p>
				<p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
					{ca.configs.length === 0
						? "A config tells the AI what to analyze and how. Create one first."
						: "Open a config and assign at least one creator to it — then come back to launch a run."}
				</p>
				<button
					type="button"
					onClick={() => onGoToStep("configs")}
					className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
				>
					<ArrowLeft size={14} />
					Go to Configs
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Pipeline preview — teaches the user what's about to happen. */}
			<div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
				<div className="flex items-center gap-2">
					<p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
						What the pipeline does
					</p>
					<span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
						<Clock size={11} />
						Usually 2–8 min
					</span>
				</div>
				<ol className="grid grid-cols-1 md:grid-cols-4 gap-2">
					{PIPELINE_STAGES.map((stage, i) => (
						<li
							key={stage.key}
							className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5"
						>
							<div className="flex items-center gap-2">
								<span
									className="w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-600 flex items-center justify-center text-[11px] font-semibold"
									aria-hidden
								>
									{i + 1}
								</span>
								<span className="text-sm font-semibold text-gray-900">{stage.label}</span>
							</div>
							<p className="mt-1 text-[11px] leading-snug text-gray-500">{stage.blurb}</p>
						</li>
					))}
				</ol>
			</div>

			{/* Launch form */}
			<div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
				<div className="flex items-center justify-between">
					<p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
						Launch a run
					</p>
					{estimatedVideos > 0 && (
						<span className="text-[11px] text-gray-500">
							≈ {estimatedVideos} video{estimatedVideos === 1 ? "" : "s"} will be analyzed
						</span>
					)}
				</div>

				<label className="block">
					<span className="block text-xs font-medium text-gray-700 mb-1.5">
						Config <span className="text-red-600">*</span>
					</span>
					<select
						className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
						value={configId}
						onChange={(e) => setConfigId(e.target.value)}
					>
						<option value="">— pick a config —</option>
						{runnableConfigs.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name} ({c.creators?.length ?? 0} creator
								{(c.creators?.length ?? 0) === 1 ? "" : "s"})
							</option>
						))}
					</select>
				</label>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
					<div className="space-y-1">
						<Input
							label="Videos per creator"
							type="number"
							min={1}
							max={10}
							value={videosPerCreator}
							onChange={(e) => setVideosPerCreator(Number(e.target.value))}
						/>
						<p className="text-[11px] text-gray-500 leading-snug">
							How many top-performing videos to analyze per creator.
						</p>
					</div>
					<div className="space-y-1">
						<Input
							label="Out of last N"
							type="number"
							min={5}
							max={50}
							value={lookbackPool}
							onChange={(e) => setLookbackPool(Number(e.target.value))}
						/>
						<p className="text-[11px] text-gray-500 leading-snug">
							Scan this many recent posts to pick the top performers from.
						</p>
					</div>
					<div className="space-y-1">
						<Input
							label="Timeframe (days)"
							type="number"
							min={1}
							max={90}
							value={timeframeDays}
							onChange={(e) => setTimeframeDays(Number(e.target.value))}
						/>
						<p className="text-[11px] text-gray-500 leading-snug">
							Only consider videos posted within this window.
						</p>
					</div>
				</div>

				{hasActiveRunForConfig && (
					<div
						role="status"
						className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
					>
						A run is already in progress for this config. Wait for it to finish before launching
						another.
					</div>
				)}
				{error && (
					<p role="alert" className="text-xs text-red-600">
						{error}
					</p>
				)}

				<div className="flex justify-end">
					<Button
						onClick={handleLaunch}
						loading={submitting}
						disabled={hasActiveRunForConfig || !configId}
					>
						<Play size={14} className="mr-1.5" />
						Run Pipeline
					</Button>
				</div>
			</div>
		</div>
	);
}

