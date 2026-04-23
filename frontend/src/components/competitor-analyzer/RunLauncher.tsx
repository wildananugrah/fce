import { useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";

interface Props {
	ca: ReturnType<typeof useCompetitorAnalyzer>;
	onLaunched: (runId: string) => void;
}

export function RunLauncher({ ca, onLaunched }: Props) {
	const [configId, setConfigId] = useState<string>(ca.configs[0]?.id ?? "");
	const [videosPerCreator, setVideosPerCreator] = useState(3);
	const [lookbackPool, setLookbackPool] = useState(20);
	const [timeframeDays, setTimeframeDays] = useState(30);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	const hasActiveRunForConfig = ca.runs.some(
		(r) => r.configId === configId && !["completed", "failed"].includes(r.status),
	);

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

	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Launch a pipeline run</p>

			<label className="block">
				<span className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
					Config
				</span>
				<select
					className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					value={configId}
					onChange={(e) => setConfigId(e.target.value)}
				>
					<option value="">— select a config —</option>
					{ca.configs.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name} ({c.creators?.length ?? 0} creators)
						</option>
					))}
				</select>
			</label>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				<Input
					label="Videos per creator"
					type="number"
					min={1}
					max={10}
					value={videosPerCreator}
					onChange={(e) => setVideosPerCreator(Number(e.target.value))}
				/>
				<Input
					label="Out of last N"
					type="number"
					min={5}
					max={50}
					value={lookbackPool}
					onChange={(e) => setLookbackPool(Number(e.target.value))}
				/>
				<Input
					label="Timeframe (days)"
					type="number"
					min={1}
					max={90}
					value={timeframeDays}
					onChange={(e) => setTimeframeDays(Number(e.target.value))}
				/>
			</div>

			{hasActiveRunForConfig && (
				<p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
					A run is already in progress for this config. Wait for it to finish before launching another.
				</p>
			)}
			{error && <p className="text-xs text-red-500">{error}</p>}

			<div className="flex justify-end">
				<Button onClick={handleLaunch} loading={submitting} disabled={hasActiveRunForConfig}>
					Run Pipeline
				</Button>
			</div>
		</div>
	);
}
