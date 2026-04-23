export class MockVideoFetcher {
	public calls: string[] = [];
	public fail: boolean = false;
	public overLimit: boolean = false;
	public bytes: Uint8Array = new Uint8Array(1024);

	/**
	 * Signature matches the `VideoFetcher` type expected by CompetitorPipelineJob.
	 * Returns {bytes, mimeType} or throws on failure.
	 */
	fetcher = async (url: string): Promise<{ bytes: Uint8Array; mimeType: string }> => {
		this.calls.push(url);
		if (this.fail) throw new Error("video download failed");
		if (this.overLimit) throw new Error("video exceeds 50 MB cap");
		return { bytes: this.bytes, mimeType: "video/mp4" };
	};
}
