import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type MyPlugin from '../main';
import { testGitHubToken, fetchGitHubRepoDetails } from './utils/github';

export class PersonaSettingTab extends PluginSettingTab {
	plugin: MyPlugin;
	private activeTab: 'general' | 'obsidian-guru' = 'general';

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Header Tab Switcher inside Settings
		const navContainer = containerEl.createDiv({ cls: 'settings-tab-nav' });
		
		const generalTabBtn = navContainer.createEl('button', {
			cls: `settings-tab-btn ${this.activeTab === 'general' ? 'is-active' : ''}`,
			text: 'General & Framework'
		});
		generalTabBtn.addEventListener('click', () => {
			if (this.activeTab !== 'general') {
				this.activeTab = 'general';
				this.display();
			}
		});

		const guruTabBtn = navContainer.createEl('button', {
			cls: `settings-tab-btn ${this.activeTab === 'obsidian-guru' ? 'is-active' : ''}`,
			text: 'Obsidian Guru'
		});
		guruTabBtn.addEventListener('click', () => {
			if (this.activeTab !== 'obsidian-guru') {
				this.activeTab = 'obsidian-guru';
				this.display();
			}
		});

		const contentContainer = containerEl.createDiv({ cls: 'settings-tab-content' });

		if (this.activeTab === 'general') {
			this.renderGeneralSettings(contentContainer);
		} else {
			this.renderGuruSettings(contentContainer);
		}
	}

	private renderGeneralSettings(container: HTMLElement): void {
		container.createEl('h2', { text: 'Persona Progression Settings' });

		new Setting(container)
			.setName('Base Folder')
			.setDesc('Default folder in your vault where new Personas will be created (e.g., "Life Management"). Leave empty for vault root.')
			.addText(text => text
				.setPlaceholder('Life Management')
				.setValue(this.plugin.settings.baseFolder)
				.onChange(async (value) => {
					this.plugin.settings.baseFolder = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(container)
			.setName('Maximum Allowed active tasks')
			.setDesc('Maximum number of active tasks allowed (status not equal to done or future). Set to 0 for unlimited.')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(String(this.plugin.settings.maxActiveTasks ?? 0))
				.onChange(async (value) => {
					const parsed = parseInt(value.trim(), 10);
					this.plugin.settings.maxActiveTasks = isNaN(parsed) || parsed < 0 ? 0 : parsed;
					await this.plugin.saveSettings();
				}));

		new Setting(container)
			.setName('Maximum Allowed active quests')
			.setDesc('Maximum number of active quests allowed (status: active). Set to 0 for unlimited.')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(String(this.plugin.settings.maxActiveQuests ?? 0))
				.onChange(async (value) => {
					const parsed = parseInt(value.trim(), 10);
					this.plugin.settings.maxActiveQuests = isNaN(parsed) || parsed < 0 ? 0 : parsed;
					await this.plugin.saveSettings();
				}));

		new Setting(container)
			.setName('Maximum Allowed active duties')
			.setDesc('Maximum number of active duties allowed (status: active). Set to 0 for unlimited.')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(String(this.plugin.settings.maxActiveDuties ?? 0))
				.onChange(async (value) => {
					const parsed = parseInt(value.trim(), 10);
					this.plugin.settings.maxActiveDuties = isNaN(parsed) || parsed < 0 ? 0 : parsed;
					await this.plugin.saveSettings();
				}));

		container.createEl('h2', { text: 'Dashboard Background Settings' });

		new Setting(container)
			.setName('Unsplash Access Key')
			.setDesc('Enter your Unsplash API Access Key to fetch random landscape background images for your dashboard. Leave blank to use built-in backdrops.')
			.addText(text => {
				text.inputEl.type = 'password';
				text.setPlaceholder('Enter Unsplash Access Key')
					.setValue(this.plugin.settings.unsplashAccessKey ?? '')
					.onChange(async (value) => {
						this.plugin.settings.unsplashAccessKey = value.trim();
						await this.plugin.saveSettings();
					});
			});
	}

	private renderGuruSettings(container: HTMLElement): void {
		container.createEl('h2', { text: 'Obsidian Guru Persona Settings' });

		// GitHub PAT Setting with Edit & Test Buttons
		let tokenInputEl: HTMLInputElement;
		let isEditingToken = false;

		new Setting(container)
			.setName('GitHub Personal Access Token (PAT)')
			.setDesc('Optional PAT to access private repositories or bypass rate limits for GitHub API.')
			.addText(text => {
				tokenInputEl = text.inputEl;
				tokenInputEl.type = 'password';
				tokenInputEl.disabled = true;
				text.setPlaceholder('ghp_xxxxxxxxxxxx')
					.setValue(this.plugin.settings.githubToken ?? '')
					.onChange(async (value) => {
						this.plugin.settings.githubToken = value.trim();
						await this.plugin.saveSettings();
					});
			})
			.addButton(btn => {
				btn.setButtonText('Edit')
					.onClick(() => {
						isEditingToken = !isEditingToken;
						tokenInputEl.disabled = !isEditingToken;
						btn.setButtonText(isEditingToken ? 'Save' : 'Edit');
						if (isEditingToken) tokenInputEl.focus();
					});
			})
			.addButton(btn => {
				btn.setButtonText('Test')
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText('Testing...');
						const result = await testGitHubToken(this.plugin.settings.githubToken);
						btn.setDisabled(false);
						btn.setButtonText('Test');

						if (result.success) {
							new Notice(`✅ PAT Validated! Authenticated as @${result.username}`);
						} else {
							new Notice(`❌ PAT Validation Failed: ${result.error}`);
						}
					});
			});

		// Tracked Repos Setting with Edit & Test Buttons
		let reposTextAreaEl: HTMLTextAreaElement;
		let isEditingRepos = false;

		new Setting(container)
			.setName('Tracked GitHub Repositories')
			.setDesc('Enter repository names with optional release period in days (e.g. owner/repo or owner/repo:14), one per line.')
			.addTextArea(text => {
				reposTextAreaEl = text.inputEl;
				reposTextAreaEl.disabled = true;
				const currentRepos = this.plugin.settings.obsidianGuruRepos || [];
				const releasePeriods = this.plugin.settings.repoReleasePeriods || {};
				const formattedLines = currentRepos.map(r => {
					const clean = r.trim().toLowerCase();
					return releasePeriods[clean] ? `${r}:${releasePeriods[clean]}` : r;
				});
				text.setPlaceholder('obsidianmd/obsidian-sample-plugin:30\nusername/my-obsidian-plugin:14')
					.setValue(formattedLines.join('\n'))
					.onChange(async (value) => {
						const lines = value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
						const newRepos: string[] = [];
						const newPeriods: Record<string, number> = {};

						for (const line of lines) {
							const parts = line.split(':');
							if (parts.length >= 2 && !isNaN(parseInt(parts[parts.length - 1], 10))) {
								const days = parseInt(parts.pop()!, 10);
								const repoPath = parts.join(':').trim();
								newRepos.push(repoPath);
								newPeriods[repoPath.toLowerCase()] = days;
							} else {
								newRepos.push(line);
							}
						}

						this.plugin.settings.obsidianGuruRepos = newRepos;
						this.plugin.settings.repoReleasePeriods = newPeriods;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 5;
				text.inputEl.cols = 40;
			})
			.addButton(btn => {
				btn.setButtonText('Edit')
					.onClick(() => {
						isEditingRepos = !isEditingRepos;
						reposTextAreaEl.disabled = !isEditingRepos;
						btn.setButtonText(isEditingRepos ? 'Save' : 'Edit');
						if (isEditingRepos) reposTextAreaEl.focus();
					});
			})
			.addButton(btn => {
				btn.setButtonText('Test')
					.onClick(async () => {
						const repos = this.plugin.settings.obsidianGuruRepos || [];
						if (repos.length === 0) {
							new Notice('⚠️ No repositories listed to test.');
							return;
						}
						btn.setDisabled(true);
						btn.setButtonText('Testing...');
						const results = await Promise.all(
							repos.map(r => fetchGitHubRepoDetails(r, this.plugin.settings.githubToken))
						);
						btn.setDisabled(false);
						btn.setButtonText('Test');

						const failed = results.filter(r => r.error);
						if (failed.length === 0) {
							new Notice(`✅ All ${repos.length} repository paths verified successfully!`);
						} else {
							new Notice(`⚠️ ${failed.length} of ${repos.length} repos failed. Check details in dashboard.`);
						}
					});
			});

		// Mental Gymnast Settings
		new Setting(container)
			.setName('Mental Gymnast: Lichess Username')
			.setDesc('Your Lichess username used to track chess rapid ratings.')
			.addText(text => {
				text.setPlaceholder('tomatopotato69')
					.setValue(this.plugin.settings.lichessUsername || 'tomatopotato69')
					.onChange(async (val) => {
						this.plugin.settings.lichessUsername = val.trim();
						await this.plugin.saveSettings();
					});
			});
	}
}
