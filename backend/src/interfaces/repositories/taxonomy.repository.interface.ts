import type { Framework, HookType } from "@prisma/client";

export interface ITaxonomyRepository {
	findAllFrameworks(): Promise<Framework[]>;
	findAllHookTypes(): Promise<HookType[]>;
}
