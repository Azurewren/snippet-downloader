import {Notice, Plugin} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	SnippetDownloaderSettings,
	SnippetDownloaderTabs, SnippetRepo
} from "./settings";
import {SnippetDownloaderModals} from "./modals/simpleCommands";
import {RepoDownloader, SpecificSnippetDownloader} from "./modals/updateSnippets";
import {ExcludeSnippet} from "./modals/excludeSnippet";
import {addSnippet, updateRepo} from "./addSnippets";
import {normalizeSettings} from "./utils";

export default class snippetDownloader extends Plugin {
	settings: SnippetDownloaderSettings;

	getGitHubToken(): string | undefined {
		const secretId = this.settings.githubTokenSecretId;
		if (!secretId) {
			return undefined;
		}
		const token = this.app.secretStorage.getSecret(secretId);
		if (!token) {
			const message = 'The selected GitHub token is missing from Obsidian SecretStorage. Select it again in plugin settings.';
			new Notice(message);
			throw new Error(message);
		}
		return token;
	}

	async updateAllSnippets() {
		if (this.settings.snippetList.length > 0) {
			for (const repoName of [...this.settings.snippetList]) {
				const updatedSettings = await updateRepo(
					repoName.repo,
					this.settings.snippetList,
					this.app.vault,
					this.settings.excludedSnippet,
					this.settings.errorSnippet,
					this.getGitHubToken()
				);
				await this.updateList(updatedSettings);
			}
		}
	}
	
	async updateList(newSettings: [snippetList: SnippetRepo[], errorSnippet: string]){
		[this.settings.snippetList, this.settings.errorSnippet] = newSettings;
		await this.saveSettings();
	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'add-snippet',
			name: 'Adding new snippet',
			callback: ()=> {
				new SnippetDownloaderModals(this.app, async (result) => {
					if (result) {
						const newSettings = await addSnippet(result.trim(), this.settings, this.app.vault, this.getGitHubToken());
						await this.updateList(newSettings);
					}
				}).open();
			}
		});

		this.addCommand({
			id: 'update-all-snippets',
			name: 'Update all snippets',
			checkCallback: (checking: boolean) => {
				if (this.settings.snippetList.length > 0) {
					if (!checking) {
						this.updateAllSnippets().catch(console.error);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'update-specific-repo',
			name: 'Update specific repository',
			hotkeys:[],
			checkCallback: (checking:boolean) => {
				if (this.settings.snippetList.length > 0){
					if (!checking) {
						new RepoDownloader(this.app, this.settings, this).open();
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'update-specific-snippet',
			name: 'Update specific snippet',
			hotkeys:[],
			checkCallback: (checking:boolean) => {
				if (this.settings.snippetList.length > 0) {
					if (!checking) {
						new SpecificSnippetDownloader(this.app, this.settings, this).open();
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'remove-specific-snippet',
			name: 'Exclude specific snippet',
			hotkeys:[],
			checkCallback: (checking:boolean) => {
				if (this.settings.snippetList.length > 0) {
					if (!checking) {
						new ExcludeSnippet(this.app, this.settings, this).open();
					}
					return true;
				}
				return false;
			}
		})

		this.addSettingTab(new SnippetDownloaderTabs(this.app, this));


	}

	onunload() {

	}

	async loadSettings() {
		this.settings = normalizeSettings(await this.loadData(), DEFAULT_SETTINGS);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
