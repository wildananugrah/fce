import type { Framework, HookType } from "@prisma/client";

export interface ITaxonomyService {
	getFrameworks(): Promise<Framework[]>;
	getHookTypes(): Promise<HookType[]>;
}
