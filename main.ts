import { Plugin } from 'obsidian';
import { PersonaSettingTab } from './src/settings';
import { DEFAULT_SETTINGS, PersonaPluginSettings } from './src/types';
import { UniversalAddModal } from './src/ui/universal-add-modal';

export default class MyPlugin extends Plugin {
	settings: PersonaPluginSettings;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon for adding a new persona element
		this.addRibbonIcon('plus-circle', 'Add Persona Element', () => {
			new UniversalAddModal(this.app, this).open();
		});

		// Add command to open universal modal
		this.addCommand({
			id: 'add-persona-element',
			name: 'Add element (Persona framework)',
			callback: () => {
				new UniversalAddModal(this.app, this).open();
			}
		});

		// Add settings tab
		this.addSettingTab(new PersonaSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
