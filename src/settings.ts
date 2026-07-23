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
	}
}
