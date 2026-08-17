import { Plugin } from 'obsidian';
import { PersonaSettingTab } from './src/settings';
import { DEFAULT_SETTINGS, PersonaPluginSettings } from './src/types';
import { UniversalAddModal } from './src/ui/universal-add-modal';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './src/ui/dashboard-view';

export default class MyPlugin extends Plugin {
	settings: PersonaPluginSettings;

	async onload() {
		await this.loadSettings();

		// Register Dashboard View
		this.registerView(
			DASHBOARD_VIEW_TYPE,
			(leaf) => new DashboardView(leaf, this)
		);

		// Add ribbon icon for Central Dashboard
		this.addRibbonIcon('layout-dashboard', 'Open Central Dashboard', () => {
			this.activateDashboardView();
		});

		// Add ribbon icon for adding a new persona element
		this.addRibbonIcon('plus-circle', 'Add Persona Element', () => {
			new UniversalAddModal(this.app, this).open();
		});

		// Add command to open Central Dashboard
		this.addCommand({
			id: 'open-central-dashboard',
			name: 'Open Central Dashboard',
			callback: () => {
				this.activateDashboardView();
			}
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
		this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
	}

	async activateDashboardView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];

		if (!leaf) {
			leaf = workspace.getLeaf(false);
			await leaf.setViewState({
				type: DASHBOARD_VIEW_TYPE,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
