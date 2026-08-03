import { App, PluginSettingTab, Setting } from 'obsidian';
import type MyPlugin from '../main';

export class PersonaSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Persona Progression Settings' });

		new Setting(containerEl)
			.setName('Base Folder')
			.setDesc('Default folder in your vault where new Personas will be created (e.g., "Life Management"). Leave empty for vault root.')
			.addText(text => text
				.setPlaceholder('Life Management')
				.setValue(this.plugin.settings.baseFolder)
				.onChange(async (value) => {
					this.plugin.settings.baseFolder = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
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
	}
}
