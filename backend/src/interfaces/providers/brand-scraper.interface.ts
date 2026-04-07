export interface BrandScrapingInput {
	url: string;
}

export interface BrandScrapingOutput {
	name: string;
	category?: string;
	personality?: string;
	tone?: string;
	values?: string[];
	vocabulary?: { preferred?: string[]; avoided?: string[] };
}

export interface IBrandScraper {
	scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput>;
}
