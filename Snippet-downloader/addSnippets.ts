import {Notice, normalizePath, Vault} from "obsidian";
import {SnippetDownloaderSettings, SnippetRepo, SnippetSettingsUpdate, SnippetInformation} from "./settings";
import {
	checkLastUpdate,
	downloadSnippet,
	grabLastCommitDate,
	listSnippetfromRepo
} from "./downloader";
import {basename, getLocalSnippetName, normalizeLocalSnippetName, searchExcluded} from "./utils";
import {SnippetUpdate} from "./modals/updateSnippets";

function validateSnippetFileNames(repositories: SnippetRepo[], candidateRepo: string, candidates: SnippetInformation[]): void {
	const names = new Map<string, string>();
	const check = (repo: string, snippet: SnippetInformation) => {
		const localName = normalizeLocalSnippetName(getLocalSnippetName(snippet)).toLowerCase();
		const existing = names.get(localName);
		if (existing) {
			const message = `The snippets "${existing}" and "${repo}: ${snippet.name}" would both be saved as "${getLocalSnippetName(snippet)}". Rename one before downloading.`;
			new Notice(message);
			throw new Error(message);
		}
		names.set(localName, `${repo}: ${snippet.name}`);
	};

	for (const repo of repositories) {
		if (repo.repo !== candidateRepo) {
			for (const snippet of repo.snippetsContents) {
				check(repo.repo, snippet);
			}
		}
	}
	for (const snippet of candidates) {
		check(candidateRepo, snippet);
	}
}

export async function addSnippet(
	repoPath: string,
	settings: SnippetDownloaderSettings,
	vault: Vault,
	token?: string
): Promise<SnippetSettingsUpdate> {
	const snippetList = settings.snippetList;
	if (snippetList.some(snippet => snippet.repo === repoPath)) {
		new Notice("This repository is already in the list.");
		return [snippetList, settings.errorSnippet];
	}

	const newSnippetList = await listSnippetfromRepo(repoPath, settings, token);
	if (newSnippetList.length === 0) {
		new Notice("No downloadable CSS snippets were found in this repository.");
		return [snippetList, settings.errorSnippet];
	}

	validateSnippetFileNames(snippetList, repoPath, newSnippetList);
	const snippetsFolderPath = normalizePath(`${vault.configDir}/snippets`);
	for (const snippet of newSnippetList) {
		const targetPath = normalizePath(`${snippetsFolderPath}/${getLocalSnippetName(snippet)}`);
		if (await vault.adapter.exists(targetPath)) {
			const message = `Cannot add ${snippet.name}: "${getLocalSnippetName(snippet)}" already exists in the snippets folder.`;
			new Notice(message);
			throw new Error(message);
		}
	}

	for (const snippet of newSnippetList) {
		await downloadSnippet(repoPath, snippet.name, vault, token, getLocalSnippetName(snippet));
	}

	snippetList.push({repo: repoPath, snippetsContents: newSnippetList});
	new Notice(`Successfully added ${repoPath}. ${newSnippetList.length} snippets added.`);
	return [snippetList, settings.errorSnippet];
}

export async function updateRepo(
	repoPath: string,
	snippetList: SnippetRepo[],
	vault: Vault,
	excludedSnippets: string,
	errorSnippets: string,
	token?: string
): Promise<SnippetSettingsUpdate> {
	const repo = snippetList.find(item => item.repo === repoPath);
	if (!repo) {
		const message = `Repository ${repoPath} is not in the snippet list.`;
		new Notice(message);
		throw new Error(message);
	}
	validateSnippetFileNames(snippetList, repoPath, repo.snippetsContents);

	for (const snippet of repo.snippetsContents) {
		if (
			snippet.name === "obsidian.css" ||
			searchExcluded(excludedSnippets, snippet.name) ||
			searchExcluded(errorSnippets, snippet.name)
		) {
			continue;
		}
		const latestUpdate = await grabLastCommitDate(repoPath, snippet.name, token);
		if (checkLastUpdate(snippet, latestUpdate)) {
			await downloadSnippet(repoPath, snippet.name, vault, token, getLocalSnippetName(snippet));
			snippet.lastUpdate = latestUpdate;
		}
	}

	new Notice(`${repoPath} successfully updated.`);
	return [snippetList, errorSnippets];
}

export async function updateSpecificSnippet(
	item: SnippetUpdate | undefined,
	settings: SnippetDownloaderSettings,
	vault: Vault,
	token?: string
): Promise<SnippetSettingsUpdate> {
	if (!item) {
		const message = "The selected snippet is no longer available.";
		new Notice(message);
		throw new Error(message);
	}
	const repo = settings.snippetList.find(entry => entry.repo === item.repo);
	const snippet = repo?.snippetsContents.find(entry => entry.name === item.snippetPath);
	if (!snippet) {
		const message = `Snippet ${item.snippetPath} is no longer available in ${item.repo}.`;
		new Notice(message);
		throw new Error(message);
	}

	const latestUpdate = await grabLastCommitDate(item.repo, snippet.name, token);
	if (checkLastUpdate(snippet, latestUpdate)) {
		await downloadSnippet(item.repo, snippet.name, vault, token, getLocalSnippetName(snippet));
		snippet.lastUpdate = latestUpdate;
		new Notice(`${getLocalSnippetName(snippet)} has been updated.`);
	} else {
		new Notice(`${getLocalSnippetName(snippet)} is already up to date.`);
	}
	return [settings.snippetList, settings.errorSnippet];
}

export async function renameSnippetFile(
	repoPath: string,
	snippet: SnippetInformation,
	requestedName: string,
	settings: SnippetDownloaderSettings,
	vault: Vault
): Promise<void> {
	const localName = normalizeLocalSnippetName(requestedName);
	const currentName = getLocalSnippetName(snippet);
	if (localName === currentName) {
		return;
	}

	const repo = settings.snippetList.find(item => item.repo === repoPath);
	if (!repo || !repo.snippetsContents.includes(snippet)) {
		const message = `Could not find ${snippet.name} in ${repoPath}.`;
		new Notice(message);
		throw new Error(message);
	}

	validateSnippetFileNames(
		settings.snippetList,
		repoPath,
		repo.snippetsContents.map(item => item === snippet ? {...item, localName} : item)
	);

	const folderPath = normalizePath(`${vault.configDir}/snippets`);
	const sourcePath = normalizePath(`${folderPath}/${normalizeLocalSnippetName(currentName)}`);
	const targetPath = normalizePath(`${folderPath}/${localName}`);
	if (await vault.adapter.exists(targetPath)) {
		const message = `"${localName}" already exists in the snippets folder.`;
		new Notice(message);
		throw new Error(message);
	}

	const source = await vault.adapter.stat(sourcePath);
	if (source && source.type === "folder") {
		const message = `Cannot rename ${currentName}: the source path is a folder.`;
		new Notice(message);
		throw new Error(message);
	}
	if (source) {
		try {
			await vault.adapter.rename(sourcePath, targetPath);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			const message = `Could not rename ${currentName} to ${localName}: ${detail}`;
			new Notice(message);
			throw new Error(message);
		}
	}

	if (localName === basename(snippet.name)) {
		delete snippet.localName;
	} else {
		snippet.localName = localName;
	}
	new Notice(`Snippet will now be saved as ${localName}.`);
}
