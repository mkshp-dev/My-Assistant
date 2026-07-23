import { App, Modal, Notice, Setting } from 'obsidian';
import type MyPlugin from '../../main';
import { EntityKind, MilestoneItem, ObjectiveItem, PersonaItem, QuestItem, QuestStatus, StageItem } from '../types';
import { createMilestone, createObjective, createPersona, createQuest, createStage, createTask } from '../utils/file-creator';
import { getMilestones, getObjectives, getPersonas, getQuests, getStages } from '../utils/vault-scanner';

export class UniversalAddModal extends Modal {
	plugin: MyPlugin;
	selectedKind: EntityKind = 'task';
	formContainerEl: HTMLElement;

	// Inputs
	elementName = '';
	baseFolder = '';
	questStatus: QuestStatus = 'active';

	// Selected parent items
	selectedPersona?: PersonaItem;
	selectedStage?: StageItem;
	selectedMilestone?: MilestoneItem;
	selectedObjective?: ObjectiveItem;
	selectedQuest?: QuestItem;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
		this.baseFolder = this.plugin.settings.baseFolder;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('persona-add-modal');

		contentEl.createEl('h2', { text: 'Add Persona Element' });

		// Kind Selection Dropdown
		new Setting(contentEl)
			.setName('Select element to add')
			.setDesc('Choose the type of entity you want to create')
			.addDropdown(dropdown => {
				dropdown
					.addOption('task', 'Task')
					.addOption('quest', 'Quest')
					.addOption('objective', 'Objective')
					.addOption('milestone', 'Milestone')
					.addOption('stage', 'Stage')
					.addOption('persona', 'Persona')
					.setValue(this.selectedKind)
					.onChange((value) => {
						this.selectedKind = value as EntityKind;
						this.elementName = '';
						this.renderForm();
					});
			});

		this.formContainerEl = contentEl.createDiv({ cls: 'persona-form-container' });
		this.renderForm();
	}

	renderForm() {
		this.formContainerEl.empty();

		switch (this.selectedKind) {
			case 'persona':
				this.renderPersonaForm();
				break;
			case 'stage':
				this.renderStageForm();
				break;
			case 'milestone':
				this.renderMilestoneForm();
				break;
			case 'objective':
				this.renderObjectiveForm();
				break;
			case 'quest':
				this.renderQuestForm();
				break;
			case 'task':
				this.renderTaskForm();
				break;
		}

		this.renderSubmitButton();
	}

	private renderPersonaForm() {
		new Setting(this.formContainerEl)
			.setName('Persona Name')
			.setDesc('Enter the name of the new persona (e.g. "Obsidian Guru")')
			.addText(text => {
				text.setPlaceholder('Persona Name')
					.setValue(this.elementName)
					.onChange(val => { this.elementName = val; });
			});

		new Setting(this.formContainerEl)
			.setName('Base Folder')
			.setDesc('Folder in vault where this Persona folder will be created')
			.addText(text => {
				text.setPlaceholder('Life Management')
					.setValue(this.baseFolder)
					.onChange(val => { this.baseFolder = val; });
			});
	}

	private renderStageForm() {
		const personas = getPersonas(this.app);

		if (personas.length === 0) {
			this.formContainerEl.createEl('p', {
				text: 'No Personas found in vault. Please create a Persona first.',
				cls: 'persona-warning-text'
			});
			return;
		}

		if (!this.selectedPersona) {
			this.selectedPersona = personas[0];
		}

		new Setting(this.formContainerEl)
			.setName('Add stage to which persona?')
			.setDesc('Select parent Persona')
			.addDropdown(dropdown => {
				personas.forEach((p, idx) => {
					dropdown.addOption(String(idx), p.name);
				});
				dropdown.setValue(String(personas.indexOf(this.selectedPersona || personas[0])));
				dropdown.onChange(idxStr => {
					this.selectedPersona = personas[Number(idxStr)];
				});
			});

		new Setting(this.formContainerEl)
			.setName('Stage Name')
			.setDesc('Enter stage name (e.g. "Foundation")')
			.addText(text => {
				text.setPlaceholder('Stage Name')
					.setValue(this.elementName)
					.onChange(val => { this.elementName = val; });
			});
	}

	private renderMilestoneForm() {
		const stages = getStages(this.app);

		if (stages.length === 0) {
			this.formContainerEl.createEl('p', {
				text: 'No Stages found in vault. Please create a Stage first.',
				cls: 'persona-warning-text'
			});
			return;
		}

		if (!this.selectedStage) {
			this.selectedStage = stages[0];
		}

		new Setting(this.formContainerEl)
			.setName('Add milestone to which stage?')
			.setDesc('Select parent Stage')
			.addDropdown(dropdown => {
				stages.forEach((st, idx) => {
					const label = st.persona ? `${st.name} (${st.persona})` : st.name;
					dropdown.addOption(String(idx), label);
				});
				dropdown.setValue(String(stages.indexOf(this.selectedStage || stages[0])));
				dropdown.onChange(idxStr => {
					this.selectedStage = stages[Number(idxStr)];
				});
			});

		new Setting(this.formContainerEl)
			.setName('Milestone Name')
			.setDesc('Enter milestone name (e.g. "Community recognized developer")')
			.addText(text => {
				text.setPlaceholder('Milestone Name')
					.setValue(this.elementName)
					.onChange(val => { this.elementName = val; });
			});
	}

	private renderObjectiveForm() {
		const milestones = getMilestones(this.app);

		if (milestones.length === 0) {
			this.formContainerEl.createEl('p', {
				text: 'No Milestones found in vault. Please create a Milestone first.',
				cls: 'persona-warning-text'
			});
			return;
		}

		if (!this.selectedMilestone) {
			this.selectedMilestone = milestones[0];
		}

		new Setting(this.formContainerEl)
			.setName('Add objective to which milestone?')
			.setDesc('Select parent Milestone')
			.addDropdown(dropdown => {
				milestones.forEach((m, idx) => {
					const label = m.stage ? `${m.name} (${m.persona} → ${m.stage})` : m.name;
					dropdown.addOption(String(idx), label);
				});
				dropdown.setValue(String(milestones.indexOf(this.selectedMilestone || milestones[0])));
				dropdown.onChange(idxStr => {
					this.selectedMilestone = milestones[Number(idxStr)];
				});
			});

		new Setting(this.formContainerEl)
			.setName('Objective Name')
			.setDesc('Enter objective name (e.g. "Best Finance plugin in the store")')
			.addText(text => {
				text.setPlaceholder('Objective Name')
					.setValue(this.elementName)
					.onChange(val => { this.elementName = val; });
			});
	}

	private renderQuestForm() {
		const objectives = getObjectives(this.app);

		if (objectives.length === 0) {
			this.formContainerEl.createEl('p', {
				text: 'No Objectives found in vault. Please create an Objective first.',
				cls: 'persona-warning-text'
			});
			return;
		}

		if (!this.selectedObjective) {
			this.selectedObjective = objectives[0];
		}

		new Setting(this.formContainerEl)
			.setName('Add quest to which objective?')
			.setDesc('Select parent Objective')
			.addDropdown(dropdown => {
				objectives.forEach((obj, idx) => {
					const label = obj.milestone ? `${obj.name} (${obj.persona} → ${obj.stage} → ${obj.milestone})` : obj.name;
					dropdown.addOption(String(idx), label);
				});
				dropdown.setValue(String(objectives.indexOf(this.selectedObjective || objectives[0])));
				dropdown.onChange(idxStr => {
					this.selectedObjective = objectives[Number(idxStr)];
				});
			});

		new Setting(this.formContainerEl)
			.setName('Quest Name')
			.setDesc('Enter quest name (e.g. "Better connection workflow and documentation")')
			.addText(text => {
				text.setPlaceholder('Quest Name')
					.setValue(this.elementName)
					.onChange(val => { this.elementName = val; });
			});

		new Setting(this.formContainerEl)
			.setName('Status')
			.setDesc('Status of the quest')
			.addDropdown(dropdown => {
				dropdown
					.addOption('active', 'Active')
					.addOption('future', 'Future')
					.addOption('completed', 'Completed')
					.setValue(this.questStatus)
					.onChange(val => { this.questStatus = val as QuestStatus; });
			});
	}

	private renderTaskForm() {
		const quests = getQuests(this.app);

		if (quests.length === 0) {
			this.formContainerEl.createEl('p', {
				text: 'No Quests found in vault. Please create a Quest first.',
				cls: 'persona-warning-text'
			});
			return;
		}

		if (!this.selectedQuest) {
			this.selectedQuest = quests[0];
		}

		new Setting(this.formContainerEl)
			.setName('Add task to which quest?')
			.setDesc('Select parent Quest')
			.addDropdown(dropdown => {
				quests.forEach((q, idx) => {
					const label = q.objective ? `${q.name} (${q.persona} → ${q.objective})` : q.name;
					dropdown.addOption(String(idx), label);
				});
				dropdown.setValue(String(quests.indexOf(this.selectedQuest || quests[0])));
				dropdown.onChange(idxStr => {
					this.selectedQuest = quests[Number(idxStr)];
				});
			});

		new Setting(this.formContainerEl)
			.setName('Task Name')
			.setDesc('Enter task name (e.g. "Reconcile local installation instructions to remote")')
			.addText(text => {
				text.setPlaceholder('Task Name')
					.setValue(this.elementName)
					.onChange(val => { this.elementName = val; });
			});
	}

	private renderSubmitButton() {
		new Setting(this.formContainerEl)
			.addButton(btn => {
				btn.setButtonText('Create')
					.setCta()
					.onClick(async () => {
						await this.handleSubmit();
					});
			});
	}

	private async handleSubmit() {
		const name = this.elementName.trim();
		if (!name) {
			new Notice('Please enter a name for the element.');
			return;
		}

		try {
			let createdFile;

			switch (this.selectedKind) {
				case 'persona':
					createdFile = await createPersona(this.app, this.baseFolder, name);
					break;

				case 'stage':
					if (!this.selectedPersona) {
						new Notice('Please select a parent Persona.');
						return;
					}
					createdFile = await createStage(this.app, this.selectedPersona, name);
					break;

				case 'milestone':
					if (!this.selectedStage) {
						new Notice('Please select a parent Stage.');
						return;
					}
					createdFile = await createMilestone(this.app, this.selectedStage, name);
					break;

				case 'objective':
					if (!this.selectedMilestone) {
						new Notice('Please select a parent Milestone.');
						return;
					}
					createdFile = await createObjective(this.app, this.selectedMilestone, name);
					break;

				case 'quest':
					if (!this.selectedObjective) {
						new Notice('Please select a parent Objective.');
						return;
					}
					createdFile = await createQuest(this.app, this.selectedObjective, name, this.questStatus);
					break;

				case 'task':
					if (!this.selectedQuest) {
						new Notice('Please select a parent Quest.');
						return;
					}
					createdFile = await createTask(this.app, this.selectedQuest, name);
					break;
			}

			if (createdFile) {
				new Notice(`Created ${this.selectedKind}: ${createdFile.basename}`);
				await this.app.workspace.getLeaf().openFile(createdFile);
				this.close();
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Error creating element: ${msg}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
