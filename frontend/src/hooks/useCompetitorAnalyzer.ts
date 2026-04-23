import { useCallback, useEffect, useRef, useState } from "react";
import { useSSE } from "./useSSE";
import { useWorkspace } from "./useWorkspace";
import { useProject } from "./useProject";
import {
	archiveCreator as apiArchiveCreator,
	cancelRun as apiCancelRun,
	createConfig as apiCreateConfig,
	createCreator as apiCreateCreator,
	createRun as apiCreateRun,
	deleteConfig as apiDeleteConfig,
	getRun as apiGetRun,
	listConfigs as apiListConfigs,
	listCreators as apiListCreators,
	listRuns as apiListRuns,
	refreshCreator as apiRefreshCreator,
	replaceConfigCreators as apiReplaceConfigCreators,
	updateConfig as apiUpdateConfig,
	type AnalysisConfig,
	type Creator,
	type PipelineRun,
	type PipelineRunDetail,
} from "../services/competitor-analyzer.api";

export function useCompetitorAnalyzer() {
	const { activeWorkspace } = useWorkspace();
	const { activeProject } = useProject();
	const workspaceId = activeWorkspace?.id ?? "";
	const projectId = activeProject?.id ?? "";
	const ready = Boolean(workspaceId && projectId);

	const [creators, setCreators] = useState<Creator[]>([]);
	const [configs, setConfigs] = useState<AnalysisConfig[]>([]);
	const [runs, setRuns] = useState<PipelineRun[]>([]);
	const [activeRun, setActiveRun] = useState<PipelineRunDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refreshingRuns = useRef(false);
	const activeRunRef = useRef<PipelineRunDetail | null>(null);
	useEffect(() => {
		activeRunRef.current = activeRun;
	}, [activeRun]);

	// ── Initial load ──────────────────────────────────────
	useEffect(() => {
		if (!ready) return;
		let cancelled = false;
		setLoading(true);
		Promise.all([
			apiListCreators(workspaceId, projectId),
			apiListConfigs(workspaceId, projectId),
			apiListRuns(workspaceId, projectId),
		])
			.then(([c, cfg, r]) => {
				if (cancelled) return;
				setCreators(c);
				setConfigs(cfg);
				setRuns(r);
			})
			.catch((err) => !cancelled && setError(err.message))
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [ready, workspaceId, projectId]);

	// ── SSE wiring ────────────────────────────────────────
	useSSE((event) => {
		if (!ready) return;
		const data = event.data as Record<string, unknown>;
		switch (event.type) {
			case "creator_enrichment_completed": {
				apiListCreators(workspaceId, projectId).then(setCreators).catch(() => {});
				break;
			}
			case "competitor_pipeline_stage_changed": {
				const runId = data.runId as string;
				const status = data.status as PipelineRun["status"];
				const stage = data.stage as string | null;
				setRuns((prev) =>
					prev.map((r) => (r.id === runId ? { ...r, status, stage } : r)),
				);
				setActiveRun((prev) =>
					prev && prev.id === runId ? { ...prev, status, stage } : prev,
				);
				break;
			}
			case "competitor_pipeline_video_analyzed": {
				const runId = data.runId as string;
				if (activeRunRef.current?.id === runId) {
					apiGetRun(workspaceId, projectId, runId).then(setActiveRun).catch(() => {});
				}
				break;
			}
			case "competitor_pipeline_completed":
			case "competitor_pipeline_failed": {
				const runId = data.runId as string;
				if (!refreshingRuns.current) {
					refreshingRuns.current = true;
					apiListRuns(workspaceId, projectId)
						.then(setRuns)
						.finally(() => {
							refreshingRuns.current = false;
						});
				}
				if (activeRunRef.current?.id === runId) {
					apiGetRun(workspaceId, projectId, runId).then(setActiveRun).catch(() => {});
				}
				break;
			}
		}
	});

	// ── Action wrappers ───────────────────────────────────
	const refreshCreators = useCallback(async () => {
		const next = await apiListCreators(workspaceId, projectId);
		setCreators(next);
	}, [workspaceId, projectId]);

	const refreshConfigs = useCallback(async () => {
		const next = await apiListConfigs(workspaceId, projectId);
		setConfigs(next);
	}, [workspaceId, projectId]);

	const refreshRuns = useCallback(async () => {
		const next = await apiListRuns(workspaceId, projectId);
		setRuns(next);
	}, [workspaceId, projectId]);

	const loadRun = useCallback(
		async (runId: string) => {
			const detail = await apiGetRun(workspaceId, projectId, runId);
			setActiveRun(detail);
			return detail;
		},
		[workspaceId, projectId],
	);

	const addCreator = useCallback(
		async (input: { profileUrl: string; username: string; niche: string }) => {
			const created = await apiCreateCreator(workspaceId, projectId, input);
			setCreators((prev) => [created, ...prev]);
			return created;
		},
		[workspaceId, projectId],
	);

	const archiveCreator = useCallback(
		async (id: string) => {
			await apiArchiveCreator(workspaceId, projectId, id);
			setCreators((prev) => prev.filter((c) => c.id !== id));
		},
		[workspaceId, projectId],
	);

	const retryCreatorEnrichment = useCallback(
		async (id: string) => {
			const updated = await apiRefreshCreator(workspaceId, projectId, id);
			setCreators((prev) => prev.map((c) => (c.id === id ? updated : c)));
		},
		[workspaceId, projectId],
	);

	const saveConfig = useCallback(
		async (input: {
			id?: string;
			name: string;
			targetNiche?: string;
			brandContext: string;
			analysisInstructions: string;
			outputPreferences: string;
		}) => {
			if (input.id) {
				const updated = await apiUpdateConfig(workspaceId, projectId, input.id, input);
				setConfigs((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
				return updated;
			}
			const created = await apiCreateConfig(workspaceId, projectId, input);
			await refreshConfigs();
			return created;
		},
		[workspaceId, projectId, refreshConfigs],
	);

	const setConfigCreators = useCallback(
		async (configId: string, creatorIds: string[]) => {
			await apiReplaceConfigCreators(workspaceId, projectId, configId, creatorIds);
			await refreshConfigs();
		},
		[workspaceId, projectId, refreshConfigs],
	);

	const removeConfig = useCallback(
		async (id: string) => {
			await apiDeleteConfig(workspaceId, projectId, id);
			setConfigs((prev) => prev.filter((c) => c.id !== id));
		},
		[workspaceId, projectId],
	);

	const launchRun = useCallback(
		async (input: {
			configId: string;
			videosPerCreator: number;
			lookbackPool: number;
			timeframeDays: number;
		}) => {
			const run = await apiCreateRun(workspaceId, projectId, input);
			setRuns((prev) => [run, ...prev]);
			return run;
		},
		[workspaceId, projectId],
	);

	const cancelRun = useCallback(
		async (id: string) => {
			await apiCancelRun(workspaceId, projectId, id);
			await refreshRuns();
		},
		[workspaceId, projectId, refreshRuns],
	);

	return {
		ready,
		loading,
		error,
		creators,
		configs,
		runs,
		activeRun,
		loadRun,
		refreshCreators,
		refreshConfigs,
		refreshRuns,
		addCreator,
		archiveCreator,
		retryCreatorEnrichment,
		saveConfig,
		setConfigCreators,
		removeConfig,
		launchRun,
		cancelRun,
	};
}
