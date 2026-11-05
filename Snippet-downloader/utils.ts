import {Notice} from "obsidian";
import type {SnippetDownloaderSettings, SnippetInformation, SnippetRepo} from "./settings";

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Merges stored data (possibly from an older version or corrupted) over the defaults. */
export function normalizeSettings(data: unknown, defaults: SnippetDownloaderSettings): SnippetDownloaderSettings {
	const stored = isObject(data) ? data : {};
	const snippetList: SnippetRepo[] = [];
	if (Array.isArray(stored.snippetList)) {
		for (const repo of stored.snippetList) {
			if (!isObject(repo) || typeof repo.repo !== "string" || !Array.isArray(repo.snippetsContents)) {
				continue;
			}
			const snippetsContents: SnippetInformation[] = [];
			for (const snippet of repo.snippetsContents) {
				if (!isObject(snippet) || typeof snippet.name !== "string" || typeof snippet.lastUpdate !== "string") {
					continue;
				}
				const info: SnippetInformation = {name: snippet.name, lastUpdate: snippet.lastUpdate};
				if (typeof snippet.localName === "string" && snippet.localName) {
					info.localName = snippet.localName;
				}
				snippetsContents.push(info);
			}
			snippetList.push({repo: repo.repo, snippetsContents});
		}
	}
	return {
		snippetList,
		excludedSnippet: typeof stored.excludedSnippet === "string" ? stored.excludedSnippet : defaults.excludedSnippet,
		errorSnippet: typeof stored.errorSnippet === "string" ? stored.errorSnippet : defaults.errorSnippet,
		githubTokenSecretId: typeof stored.githubTokenSecretId === "string" ? stored.githubTokenSecretId : defaults.githubTokenSecretId,
	};
}

export function searchExcluded(excludedSnippet: string, name: string): boolean {
	if (excludedSnippet.length < 1) {
		return false;
	}
	const excluded = excludedSnippet.split(",").map(e => {return e.trim();}).filter(x=>x.length>0)
	for (const excl of excluded){
		if (excl === name.replace(/\.css$/i, '').trim()){
			return true;
		}
		let pattern: RegExp;
		try {
			pattern = new RegExp(excl);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			const message = `Invalid exclusion regular expression "${excl}": ${detail}`;
			new Notice(message);
			throw new Error(message);
		}
		if (name.match(pattern)){
			return true;
		}
	}
	return false;
}

export function validateExcludedSnippets(excludedSnippet: string): void {
	for (const pattern of excludedSnippet.split(",").map(value => value.trim()).filter(Boolean)) {
		try {
			new RegExp(pattern);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			throw new Error(`"${pattern}" is not a valid regular expression. ${detail}`);
		}
	}
}

export function getLocalSnippetName(snippet: SnippetInformation): string {
	return snippet.localName || basename(snippet.name);
}

export function normalizeLocalSnippetName(value: string): string {
	const trimmed = value.trim();
	const baseName = trimmed.toLowerCase().endsWith(".css") ? trimmed.slice(0, -4) : trimmed;
	const fileName = `${baseName}.css`;
	if (
		!trimmed ||
		trimmed === "." ||
		trimmed === ".." ||
		fileName === ".css" ||
		fileName === "." ||
		fileName === ".." ||
		// eslint-disable-next-line no-control-regex
		/[<>:"/\\|?*\u0000-\u001f]/.test(fileName) ||
		fileName.endsWith(".") ||
		fileName.endsWith(" ") ||
		/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(fileName)
	) {
		const message = 'Enter a valid CSS filename without a folder path or reserved characters.';
		new Notice(message);
		throw new Error(message);
	}
	return fileName;
}

export function basename(path: string) {
   return path.split('/').reverse()[0];
}
