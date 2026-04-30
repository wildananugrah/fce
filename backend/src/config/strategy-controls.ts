// Centralised taxonomy for Content Generator → Advanced strategy controls.
// Edit this file (not the database) to add, rename, or remove items.

export interface StrategyControlItem {
	id: string; // stable slug; persisted into GenerationRequest text columns
	name: string; // display label
	description: string;
}

export const FRAMEWORKS: readonly StrategyControlItem[] = [
	{ id: "aida", name: "AIDA", description: "Attention, Interest, Desire, Action" },
	{ id: "pas", name: "PAS", description: "Problem, Agitate, Solution" },
	{ id: "bab", name: "BAB", description: "Before, After, Bridge" },
	{ id: "4c", name: "4C", description: "Clear, Concise, Compelling, Credible" },
	{ id: "fab", name: "FAB", description: "Features, Advantages, Benefits" },
	{
		id: "problem-solution",
		name: "Problem-Solution",
		description: "Identify a problem, then present the solution",
	},
	{ id: "storytelling", name: "Storytelling", description: "Lead with a narrative arc" },
	{ id: "listicle", name: "Listicle", description: "Numbered or bulleted breakdown" },
	{
		id: "educational-breakdown",
		name: "Educational breakdown",
		description: "Teach a concept step-by-step",
	},
	{ id: "soft-selling", name: "Soft selling", description: "Indirect, value-led pitch" },
	{ id: "hard-selling", name: "Hard selling", description: "Direct, conversion-focused pitch" },
];

export const HOOK_TYPES: readonly StrategyControlItem[] = [
	{
		id: "curiosity-hook",
		name: "Curiosity hook",
		description: "Spark curiosity with unexpected questions or facts",
	},
	{
		id: "pain-point-hook",
		name: "Pain point hook",
		description: "Address a specific pain point the audience experiences",
	},
	{
		id: "data-stat-hook",
		name: "Data/stat hook",
		description: "Open with a striking statistic or data point",
	},
	{
		id: "bold-statement-hook",
		name: "Bold statement hook",
		description: "Make a bold, attention-grabbing statement",
	},
	{
		id: "contrarian-hook",
		name: "Contrarian hook",
		description: "Take a counter-intuitive or against-the-grain stance",
	},
	{
		id: "trend-culture-hook",
		name: "Trend/culture hook",
		description: "Anchor the post to a current trend or cultural moment",
	},
	{
		id: "relatable-insight-hook",
		name: "Relatable insight hook",
		description: "Voice a thought the audience already has",
	},
	{
		id: "question-hook",
		name: "Question hook",
		description: "Open with a direct question to the reader",
	},
	{
		id: "urgency-hook",
		name: "Urgency hook",
		description: "Create time pressure or fear of missing out",
	},
	{ id: "how-to-hook", name: "How-to hook", description: "Promise a tactical, actionable outcome" },
];

export const TONE_PRESETS: readonly StrategyControlItem[] = [
	{ id: "playful-bold", name: "Playful-Bold", description: "Fun and witty with a confident edge" },
	{ id: "warm-expert", name: "Warm-Expert", description: "Approachable but authoritative" },
	{
		id: "direct-urgent",
		name: "Direct-Urgent",
		description: "Punchy, action-oriented, time-pressured",
	},
	{
		id: "soft-emphatic",
		name: "Soft-Emphatic",
		description: "Gentle, reassuring, emotionally resonant",
	},
];

export const VISUAL_STYLES: readonly StrategyControlItem[] = [
	{
		id: "editorial",
		name: "Editorial",
		description: "Magazine-quality, considered composition and typography",
	},
	{
		id: "lifestyle",
		name: "Lifestyle",
		description: "Aspirational, real-life scenarios, relatable",
	},
	{ id: "minimal", name: "Minimal", description: "Clean, simple, lots of white space" },
	{
		id: "energetic",
		name: "Energetic",
		description: "Strong colors, high contrast, motion-forward",
	},
	{ id: "luxury", name: "Luxury", description: "Sophisticated, refined, premium feel" },
	{ id: "raw-authentic", name: "Raw/Authentic", description: "Documentary, unpolished, candid" },
];
