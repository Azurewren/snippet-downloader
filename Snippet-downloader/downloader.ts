import { Base64 } from "js-base64";
import {normalizePath, Notice, requestUrl, Vault} from "obsidian";
import {
	SnippetDownloaderSettings,
	SnippetInformation,
} from "./settings";
import {searchExcluded, basename, normalizeLocalSnippetName} from "./utils";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getRepoCoordinates(repoPath: string): {owner: string; repo: string} {
	const input = repoPath.trim().replace(/\/+$/, "");
	let parts: string[];
	try {
		if (input.startsWith("https://") || input.startsWith("http://")) {
			const url = new URL(input);
			if (url.hostname.toLowerCase() !== "github.com" || url.protocol !== "https:") {
				throw new Error();
			}
			parts = url.pathname.split("/").filter(Boolean);
		} else {
			parts = input.split("/");
		}
	} catch {
		const message = `Invalid GitHub repository: ${repoPath}`;
		new Notice(message);
		throw new Error(message);
	}

	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		const message = `Invalid GitHub repository: ${repoPath}. Use owner/repository or https://github.com/owner/repository.`;
		new Notice(message);
		throw new Error(message);
	}

	return {owner: parts[0], repo: parts[1].replace(/\.git$/, "")};
}

async function requestGitHubJson(url: string, token?: string): Promise<unknown> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	let response;
	try {
		response = await requestUrl({url, headers, throw: false});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		const message = `Could not connect to GitHub: ${detail}`;
		new Notice(message);
		throw new Error(message);
	}

	const payload: unknown = response.json;
	if (response.status < 200 || response.status >= 300) {
		let detail = "";
		if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
			detail = `: ${payload.message}`;
		}
		const message = `GitHub API request failed (${response.status})${detail}`;
		new Notice(message);
		throw new Error(message);
	}

	return payload;
}

async function getDefaultBranch(repoPath: string, token?: string): Promise<string> {
	const {owner, repo} = getRepoCoordinates(repoPath);
	const repository = await requestGitHubJson(
		`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
		token
	);
	if (!isRecord(repository) || typeof repository.default_branch !== "string" || !repository.default_branch) {
		const message = `GitHub did not return a default branch for ${owner}/${repo}.`;
		new Notice(message);
		throw new Error(message);
	}
	return repository.default_branch;
}

async function getLastCommitDateFromGitHub(repoPath: string, filepath: string, token?: string): Promise<string> {
	const {owner, repo} = getRepoCoordinates(repoPath);
	const query = new URLSearchParams({path: filepath, page: "1", per_page: "1"});
	const commits = await requestGitHubJson(
		`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${query}`,
		token
	);
	if (!Array.isArray(commits) || !isRecord(commits[0]) || !isRecord(commits[0].commit)) {
		const message = `GitHub returned no commit history for ${filepath} in ${owner}/${repo}.`;
		new Notice(message);
		throw new Error(message);
	}
	const commit = commits[0].commit;
	const author = isRecord(commit.author) ? commit.author : undefined;
	const committer = isRecord(commit.committer) ? commit.committer : undefined;
	const date: unknown = author?.date ?? committer?.date;
	if (typeof date !== "string" || !date || Number.isNaN(Date.parse(date))) {
		const message = `GitHub returned an invalid commit date for ${filepath} in ${owner}/${repo}.`;
		new Notice(message);
		throw new Error(message);
	}
	return date;
}

export async function grabLastCommitDate(repoPath: string, filepath: string, token?: string): Promise<string> {
	return getLastCommitDateFromGitHub(repoPath, filepath, token);
}

export async function listSnippetfromRepo(repoPath: string, settings: SnippetDownloaderSettings, token?: string): Promise<SnippetInformation[]> {
	const branch = await getDefaultBranch(repoPath, token);
	const {owner, repo} = getRepoCoordinates(repoPath);
	const tree = await requestGitHubJson(
		`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
		token
	);
	if (!isRecord(tree) || !Array.isArray(tree.tree)) {
		const message = `GitHub returned an invalid file tree for ${owner}/${repo}.`;
		new Notice(message);
		throw new Error(message);
	}
	if (tree.truncated === true) {
		const message = `GitHub returned an incomplete file tree for ${owner}/${repo}. Try again with a token or a smaller repository.`;
		new Notice(message);
		throw new Error(message);
	}

	const snippetList: SnippetInformation[] = [];
	for (const value of tree.tree) {
		if (!isRecord(value)) {
			continue;
		}
		const path = value.path;
		if (
			value.type === "blob" &&
			typeof path === "string" &&
			path.endsWith(".css") &&
			path !== "obsidian.css" &&
			!searchExcluded(settings.excludedSnippet, path) &&
			!searchExcluded(settings.errorSnippet, path)
		) {
			snippetList.push({
				name: path,
				lastUpdate: await grabLastCommitDate(repoPath, path, token),
			});
		}
	}
	return snippetList;
}

export function checkLastUpdate(snippetName: SnippetInformation, latestUpdate: string): boolean {
	const oldDate = Date.parse(snippetName.lastUpdate);
	if (Number.isNaN(oldDate)) {
		const message = `Stored update date is invalid for ${snippetName.name}.`;
		new Notice(message);
		throw new Error(message);
	}
	const newDate = Date.parse(latestUpdate);
	if (Number.isNaN(newDate)) {
		const message = `GitHub returned an invalid commit date for ${snippetName.name}.`;
		new Notice(message);
		throw new Error(message);
	}
	return oldDate < newDate;
}

export async function downloadSnippet(repoPath: string, snippetName: string, vault: Vault, token?: string, localName = basename(snippetName)): Promise<void> {
	const {owner, repo} = getRepoCoordinates(repoPath);
	const file = await requestGitHubJson(
		`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${snippetName.split("/").map(encodeURIComponent).join("/")}`,
		token
	);
	if (!isRecord(file) || file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") {
		const message = `GitHub did not return downloadable file content for ${snippetName} in ${owner}/${repo}.`;
		new Notice(message);
		throw new Error(message);
	}

	const fileName = normalizeLocalSnippetName(localName);
	const filePath = normalizePath(`${vault.configDir}/snippets/${fileName}`);
	try {
		const snippetsFolderPath = normalizePath(`${vault.configDir}/snippets`);
		// The Vault index skips dot-folders like .obsidian, so use the adapter.
		const folderStat = await vault.adapter.stat(snippetsFolderPath);
		if (!folderStat) {
			await vault.adapter.mkdir(snippetsFolderPath);
		} else if (folderStat.type !== "folder") {
			throw new Error(`${snippetsFolderPath} exists but is not a folder.`);
		}

		const fileStat = await vault.adapter.stat(filePath);
		if (fileStat && fileStat.type !== "file") {
			throw new Error(`${filePath} exists but is not a file.`);
		}
		await vault.adapter.write(filePath, Base64.decode(file.content));
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		const message = `Could not write ${fileName} to the Obsidian snippets folder: ${detail}`;
		new Notice(message);
		throw new Error(message);
	}
}
