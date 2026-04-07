export interface BrandScrapingInput {
	url: string;
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
