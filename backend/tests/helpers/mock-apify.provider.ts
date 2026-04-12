import type {
	ApifyResultItem,
	ApifyRunStatus,
	IApifyProvider,
} from "../../src/interfaces/providers/apify.interface";

export class MockApifyProvider implements IApifyProvider {
	public lastRunInput: Record<string, any> | null = null;
	public shouldFail = false;

	async runActor(
		actorId: string,
		input: Record<string, any>,
		_apiKey: string,
	): Promise<{ runId: string }> {
		if (this.shouldFail) throw new Error("Apify run failed");
		this.lastRunInput = input;
		return { runId: `run-${crypto.randomUUID().slice(0, 8)}` };
	}

	async getRunStatus(_runId: string, _apiKey: string): Promise<ApifyRunStatus> {
		return { status: "SUCCEEDED", finishedAt: new Date().toISOString() };
	}

	async getRunResults(_runId: string, _apiKey: string): Promise<ApifyResultItem[]> {
		return [];
	}

	async testConnection(_apiKey: string): Promise<boolean> {
		return !this.shouldFail;
	}
}
