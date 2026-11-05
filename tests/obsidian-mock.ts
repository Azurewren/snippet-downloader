export const notices: string[] = [];

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export function normalizePath(path: string): string {
	return path.replace(/[\\/]+/g, "/").replace(/^\/+|\/+$/g, "");
}

export async function requestUrl(): Promise<never> {
	throw new Error("requestUrl is not available in tests");
}

export type Vault = unknown;

export class FuzzySuggestModal {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class SecretComponent {}
