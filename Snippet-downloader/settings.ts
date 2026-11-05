import {
	App,
	PluginSettingTab,
	Setting, ExtraButtonComponent, ButtonComponent, SecretComponent, Notice
} from "obsidian";
import snippetDownloader from "./main";
import {removeSnippet} from "./removeSnippet";
import {SnippetDownloaderModals} from "./modals/simpleCommands";
import {addSnippet, updateRepo, updateSpecificSnippet} from "./addSnippets";
import {getAllSnippet} from "./modals/updateSnippets";
import {getLocalSnippetName, validateExcludedSnippets} from "./utils";
import {addExcludedSnippet, getExcludedSnippets} from "./modals/excludeSnippet";
import {renameSnippetFile} from "./addSnippets";

export interface SnippetInformation {
  name: string;
  lastUpdate: string;
  localName?: string;
}

export interface SnippetRepo {
	repo: string;
	snippetsContents: SnippetInformation[];
}

export interface SnippetDownloaderSettings {
	snippetList:SnippetRepo[];
	excludedSnippet:string;
	errorSnippet: string;
	githubTokenSecretId: string;
}

export type SnippetSettingsUpdate = [snippetList: SnippetRepo[], errorSnippet: string];

export const DEFAULT_SETTINGS: SnippetDownloaderSettings = {
	snippetList: [],
	excludedSnippet: "",
	errorSnippet: "",
	githubTokenSecretId: "",
};

export class SnippetDownloaderTabs extends PluginSettingTab {
	plugin: snippetDownloader;
	private openRepos = new Set<string>();

	constructor(app: App, plugin: snippetDownloader) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private async run(action: () => Promise<void>): Promise<void> {
		try {
			await action();
		} catch (error) {
			// Failing operations already show a Notice; this prevents unhandled rejections.
			console.error(error);
		}
	}


	display(): void {
		const {containerEl} = this;

		containerEl.querySelectorAll<HTMLDetailsElement>('details[data-repo]').forEach(details => {
			const repo = details.dataset.repo;
			if (!repo) return;
			if (details.open) {
				this.openRepos.add(repo);
			} else {
				this.openRepos.delete(repo);
			}
		});

		containerEl.empty();

		const allSnippets = getAllSnippet(this.plugin.settings);

		new Setting(containerEl).setName('Snippet manager').setHeading();
		const desc_excluder = document.createDocumentFragment();
		desc_excluder.createEl('span', {}, (span)=>{
			span.innerText='Type the snippet name you want to exclude from the list, without the extension.\nYou can also use regex, for example: ';
			span.createEl('code', {text: '^(.*)$'});
			span.createEl('span', {text:' will match all snippets.\n\n'});
			span.createEl('a', {}, (link)=>{
				link.innerText='You can check your regex here.';
				link.href='https://regex101.com/';
			})
		})

		let excludedSnippetDraft = this.plugin.settings.excludedSnippet;
		new Setting(containerEl)
			.setName('Excluded snippets')
			.setDesc(desc_excluder)
			.addTextArea(text => text
				.setPlaceholder('bad-css, ^legacy-.*$')
				.setValue(this.plugin.settings.excludedSnippet)
				.onChange(value => {
					excludedSnippetDraft = value;
				}))
			.addButton(button => button
				.setButtonText('Save exclusions')
				.onClick(async () => {
					try {
						validateExcludedSnippets(excludedSnippetDraft);
						this.plugin.settings.excludedSnippet = excludedSnippetDraft;
						await this.plugin.saveSettings();
						new Notice('Exclusions saved.');
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						new Notice(`Invalid exclusion pattern: ${message}`);
					}
				}));
		new Setting(containerEl)
			.setName('GitHub access token')
			.setDesc('Optional. Select a token from Obsidian SecretStorage to access private repositories and increase GitHub API rate limits.')
			.addComponent((container) => new SecretComponent(this.app, container)
				.setValue(this.plugin.settings.githubTokenSecretId)
				.onChange(async (value) => {
					this.plugin.settings.githubTokenSecretId = value ?? '';
					await this.plugin.saveSettings();
				}));
		const desc_plugins = document.createDocumentFragment();
		desc_plugins.createEl('span', {text:`The following is a list of the repository added via the command palette `
	});
		desc_plugins.createEl('div', {text:`Click the x button next to a repository to remove it from the list.`
	})
		desc_plugins.createEl("b", { text: "Note: " });
		desc_plugins.createEl('span', {text:"This does not delete the linked snippet, this should be done from your "});
		desc_plugins.createEl("code", { text: ".obsidian/snippets" });
		desc_plugins.createEl('span', {text:" folder"} );
		new Setting(containerEl)
			.setName('Repository snippet list')
			.setDesc(desc_plugins)
			.addButton((btn:ButtonComponent)=>{
				btn
					.setIcon('plus')
					.setTooltip('Add new repository')
					.onClick(() => {
						new SnippetDownloaderModals(this.app, async (result) => {
							if (result) {
								await this.run(async () => {
									const newSettings = await addSnippet(result.trim(), this.plugin.settings, this.app.vault, this.plugin.getGitHubToken());
									await this.plugin.updateList(newSettings);
									this.display();
								});
							}
						}).open();
					})
			})
			.addButton((btn:ButtonComponent)=>{
				btn
					.setIcon('install')
					.setTooltip('Update all repositories')
					.onClick(() => this.run(() => this.plugin.updateAllSnippets()))
			});
		for (const repoPath of this.plugin.settings.snippetList) {
			const details = containerEl.createEl('details');
			details.dataset.repo = repoPath.repo;
			details.open = this.openRepos.has(repoPath.repo);

			const repoName = repoPath.repo.replace('https://github.com/','')
			const summary = details.createEl('summary', { text: repoName });
			summary.addClass('snippets-downloader-summary');
			new Setting(summary)
				.setClass('snippets-downloader-options')
				.addButton((btn:ButtonComponent)=>{
					btn
						.setClass('snippets-downloader-options-button')
						.setIcon("cross")
						.setTooltip("Delete this repository from the list")
						.onClick(() => this.run(async () => {
							const newSettings=removeSnippet(repoPath.repo, this.plugin.settings.snippetList, this.plugin.settings.errorSnippet);
							await this.plugin.updateList(newSettings);
							this.openRepos.delete(repoPath.repo);
							this.display();
						}))
					})
				.addButton((btn:ButtonComponent)=>{
					btn
						.setClass('snippets-downloader-options-button')
						.setIcon("sync")
						.setTooltip("Update this repository")
						.onClick(() => this.run(async () => {
							const allSettings = await updateRepo(repoPath.repo, this.plugin.settings.snippetList, this.app.vault, this.plugin.settings.excludedSnippet, this.plugin.settings.errorSnippet, this.plugin.getGitHubToken());
							await this.plugin.updateList(allSettings);
						}))
				})
			for(const snippets of repoPath.snippetsContents) {
				new Setting(details)
					.setName(getLocalSnippetName(snippets))
					.setDesc(`GitHub source: ${snippets.name}`)
					.setClass('snippets-downloader-settings')
					.addExtraButton((btn:ExtraButtonComponent)=>{
						btn
							.setTooltip('Update this snippet')
							.setIcon('install')
							.onClick(() => this.run(async () => {
								const updatedList = await updateSpecificSnippet(allSnippets.find(s => s.repo === repoPath.repo && snippets.name === s.snippetPath), this.plugin.settings, this.app.vault, this.plugin.getGitHubToken());
								await this.plugin.updateList(updatedList);
							}))

					})
					.addExtraButton((btn:ExtraButtonComponent)=>{
						btn
							.setTooltip('Remove this snippet')
							.setIcon('trash')
							.onClick(() => this.run(async () => {
								const excludedItem = getExcludedSnippets(this.plugin.settings).find(s => s.repo === repoPath.repo && snippets.name === s.snippetPath);
								if (!excludedItem) {
									const message = `Could not find ${snippets.name} to exclude.`;
									new Notice(message);
									throw new Error(message);
								}
								const updatedList = await addExcludedSnippet(excludedItem, this.plugin.settings);
								await this.plugin.updateList(updatedList);
								this.display();
							}))
					})
				let localNameDraft = getLocalSnippetName(snippets);
				new Setting(details)
					.setName('Local filename')
					.setDesc('The GitHub source path remains unchanged for updates and exclusions.')
					.addText(text => text
						.setValue(localNameDraft)
						.setPlaceholder('snippet.css')
						.onChange(value => {
							localNameDraft = value;
						}))
					.addButton(button => button
						.setButtonText('Save name')
						.onClick(() => this.run(async () => {
							await renameSnippetFile(
								repoPath.repo,
								snippets,
								localNameDraft,
								this.plugin.settings,
								this.app.vault
							);
							await this.plugin.saveSettings();
							this.display();
						})));
			}

		}
	}
}
