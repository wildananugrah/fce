import type { Framework, HookType, TonePreset, VisualStyle } from "@prisma/client";

export interface ITaxonomyRepository {
	findAllFrameworks(): Promise<Framework[]>;
	findAllHookTypes(): Promise<HookType[]>;
	findAllTonePresets(): Promise<TonePreset[]>;
	findAllVisualStyles(): Promise<VisualStyle[]>;
}
