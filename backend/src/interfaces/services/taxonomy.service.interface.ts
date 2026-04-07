import type { Framework, HookType, TonePreset, VisualStyle } from "@prisma/client";

export interface ITaxonomyService {
	getFrameworks(): Promise<Framework[]>;
	getHookTypes(): Promise<HookType[]>;
	getTonePresets(): Promise<TonePreset[]>;
	getVisualStyles(): Promise<VisualStyle[]>;
}
