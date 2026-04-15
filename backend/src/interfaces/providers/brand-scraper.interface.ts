export interface BrandScrapingInput {
	url: string;
	// "indonesian" | "english". Controls the language of the AI-extracted
	// fields (summary, tone, dos/donts, etc). Defaults to indonesian when
	// omitted to match the rest of the app.
	language?: string;
}

export interface BrandScrapingOutput {
	name: string;
	category?: string;
	summary?: string;
	personality?: string;
	tone?: string;
	targetAudience?: string;
	brandPromise?: string;
	usp?: string;
	values?: string[];
	contentPillars?: string[];
	marketingStrategy?: string;
	dos?: string[];
	donts?: string[];
	vocabulary?: { preferred?: string[]; avoided?: string[] };
}

export interface IBrandScraper {
	scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput>;
}
