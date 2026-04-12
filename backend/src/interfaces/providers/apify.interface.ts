export interface ApifyRunStatus {
	status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTING" | "ABORTED" | "TIMED-OUT";
	startedAt?: string;
	finishedAt?: string;
}

export interface ApifyResultItem {
	[key: string]: any;
}

export interface IApifyProvider {
	runActor(actorId: string, input: Record<string, any>, apiKey: string): Promise<{ runId: string }>;
	getRunStatus(runId: string, apiKey: string): Promise<ApifyRunStatus>;
	getRunResults(runId: string, apiKey: string): Promise<ApifyResultItem[]>;
	testConnection(apiKey: string): Promise<boolean>;
}
