import { ApifyClient } from "apify-client";
import type {
	ApifyResultItem,
	ApifyRunStatus,
	IApifyProvider,
} from "../interfaces/providers/apify.interface";

export class ApifyProvider implements IApifyProvider {
	private getClient(apiKey: string): ApifyClient {
		return new ApifyClient({ token: apiKey });
	}

	async runActor(
		actorId: string,
		input: Record<string, any>,
		apiKey: string,
	): Promise<{ runId: string }> {
		const client = this.getClient(apiKey);
		const run = await client.actor(actorId).start(input, { waitForFinish: 0 });
		return { runId: run.id };
	}

	async getRunStatus(runId: string, apiKey: string): Promise<ApifyRunStatus> {
		const client = this.getClient(apiKey);
		const run = await client.run(runId).get();
		if (!run) {
			throw new Error(`Run ${runId} not found`);
		}
		return {
			status: run.status as ApifyRunStatus["status"],
			startedAt: run.startedAt?.toISOString(),
			finishedAt: run.finishedAt?.toISOString(),
		};
	}

	async getRunResults(runId: string, apiKey: string): Promise<ApifyResultItem[]> {
		const client = this.getClient(apiKey);
		const run = await client.run(runId).get();
		if (!run?.defaultDatasetId) {
			return [];
		}
		const { items } = await client.dataset(run.defaultDatasetId).listItems();
		return items;
	}

	async testConnection(apiKey: string): Promise<boolean> {
		try {
			const client = this.getClient(apiKey);
			const user = await client.user().get();
			return !!user;
		} catch {
			return false;
		}
	}
}
