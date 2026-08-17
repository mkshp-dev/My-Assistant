import { App, Modal, Notice, Setting } from 'obsidian';
import type MyPlugin from '../../main';
import { DutyItem, EntityKind, MilestoneItem, ObjectiveItem, PersonaItem, QuestItem, QuestStatus, StageItem } from '../types';
import { createDuty, createMilestone, createObjective, createPersona, createQuest, createStage, createTask } from '../utils/file-creator';
import { getDuties, getMilestones, getObjectives, getPersonas, getQuests, getStages } from '../utils/vault-scanner';

interface TaskParentOption {
	type: 'quest' | 'duty';
	item: QuestItem | DutyItem;
	label: string;
}

export class UniversalAddModal extends Modal {
	plugin: MyPlugin;
	selectedKind: EntityKind = 'task';
	formContainerEl: HTMLElement;

	// Inputs
	elementName = '';
	baseFolder = '';
	questStatus: QuestStatus = 'active';
	dutyStatus: QuestStatus = 'active';

	// Selected parent items (ancestor chain, narrows top-down)
	selectedPersona?: PersonaItem;
	selectedStage?: StageItem;
	selectedMilestone?: MilestoneItem;
	selectedObjective?: ObjectiveItem;
	selectedTaskParent?: { type: 'quest' | 'duty'; item: QuestItem | DutyItem };

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
					.addOption('duty', 'Duty')
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
			case 'duty':
				this.renderDutyForm();
				break;
			case 'task':
				this.renderTaskForm();
				break;
		}

		this.renderSubmitButton();
	}

	// ---- Ancestor filtering helpers ----

	private filterStages(stages: StageItem[]): StageItem[] {
		return stages.filter(s => !this.selectedPersona || s.persona === this.selectedPersona.name);
	}

	private filterMilestones(milestones: MilestoneItem[]): MilestoneItem[] {
		return milestones.filter(m =>
			(!this.selectedPersona || m.persona === this.selectedPersona.name) &&
			(!this.selectedStage || m.stage === this.selectedStage.name)
		);
	}

	private filterObjectives(objectives: ObjectiveItem[]): ObjectiveItem[] {
		return objectives.filter(o =>
			(!this.selectedPersona || o.persona === this.selectedPersona.name) &&
			(!this.selectedStage || o.stage === this.selectedStage.name) &&
			(!this.selectedMilestone || o.milestone === this.selectedMilestone.name)
		);
	}

	private filterQuestsOrDuties<T extends { persona: string; stage: string; milestone: string; objective: string }>(items: T[]): T[] {
		return items.filter(i =>
			(!this.selectedPersona || i.persona === this.selectedPersona.name) &&
			(!this.selectedStage || i.stage === this.selectedStage.name) &&
			(!this.selectedMilestone || i.milestone === this.selectedMilestone.name) &&
			(!this.selectedObjective || i.objective === this.selectedObjective.name)
		);
	}

	// ---- Auto-fill-upward helpers: when a lower level is picked directly,
	// backfill the ancestor selections above it so the chain stays consistent ----

	private ensurePersonaFromName(personaName: string) {
		if (this.selectedPersona) return;
		const personas = getPersonas(this.app);
		this.selectedPersona = personas.find(p => p.name === personaName);
	}

	private ensureStageFromNames(personaName: string, stageName: string) {
		this.ensurePersonaFromName(personaName);
		if (this.selectedStage) return;
		const stages = getStages(this.app);
		this.selectedStage = stages.find(s => s.name === stageName && s.persona === personaName);
	}

	private ensureMilestoneFromNames(personaName: string, stageName: string, milestoneName: string) {
		this.ensureStageFromNames(personaName, stageName);
		if (this.selectedMilestone) return;
		const milestones = getMilestones(this.app);
		this.selectedMilestone = milestones.find(m => m.name === milestoneName && m.stage === stageName && m.persona === personaName);
	}

	private ensureObjectiveFromNames(personaName: string, stageName: string, milestoneName: string, objectiveName: string) {
		this.ensureMilestoneFromNames(personaName, stageName, milestoneName);
		if (this.selectedObjective) return;
		const objectives = getObjectives(this.app);
		this.selectedObjective = objectives.find(o => o.name === objectiveName && o.milestone === milestoneName && o.stage === stageName && o.persona === personaName);
	}

	// ---- Reusable ancestor-chain dropdowns ----
	// Each returns false when it was mandatory but had no options, so the
	// calling form can bail out before rendering the name field/submit.

	private renderPersonaDropdown(mandatory: boolean, name: string, desc: string): boolean {
		const personas = getPersonas(this.app);
		if (personas.length === 0) {
			if (mandatory) {
				this.formContainerEl.createEl('p', {
					text: 'No Personas found in vault. Please create a Persona first.',
					cls: 'persona-warning-text'
				});
				return false;
			}
			return true;
		}

		if (mandatory && (!this.selectedPersona || !personas.some(p => p.path === this.selectedPersona?.path))) {
			this.selectedPersona = personas[0];
		}

		new Setting(this.formContainerEl)
			.setName(name)
			.setDesc(desc)
			.addDropdown(dropdown => {
				if (!mandatory) dropdown.addOption('', 'All Personas');
				personas.forEach((p, idx) => dropdown.addOption(String(idx), p.name));
				const idx = personas.findIndex(p => p.path === this.selectedPersona?.path);
				dropdown.setValue(idx >= 0 ? String(idx) : '');
				dropdown.onChange(val => {
					this.selectedPersona = val === '' ? undefined : personas[Number(val)];
					this.selectedStage = undefined;
					this.selectedMilestone = undefined;
					this.selectedObjective = undefined;
					this.selectedTaskParent = undefined;
					this.renderForm();
				});
			});

		return true;
	}

	private renderStageDropdown(mandatory: boolean, name: string, desc: string): boolean {
		const stages = this.filterStages(getStages(this.app));
		if (stages.length === 0) {
			if (mandatory) {
				this.formContainerEl.createEl('p', {
					text: 'No Stages found for the selected criteria. Please create a Stage first.',
					cls: 'persona-warning-text'
				});
				return false;
			}
			return true;
		}

		if (mandatory && (!this.selectedStage || !stages.some(s => s.path === this.selectedStage?.path))) {
			this.selectedStage = stages[0];
		}

		new Setting(this.formContainerEl)
			.setName(name)
			.setDesc(desc)
			.addDropdown(dropdown => {
				if (!mandatory) dropdown.addOption('', 'All Stages');
				stages.forEach((s, idx) => {
					const label = this.selectedPersona ? s.name : `${s.name} (${s.persona})`;
					dropdown.addOption(String(idx), label);
				});
				const idx = stages.findIndex(s => s.path === this.selectedStage?.path);
				dropdown.setValue(idx >= 0 ? String(idx) : '');
				dropdown.onChange(val => {
					if (val === '') {
						this.selectedStage = undefined;
					} else {
						const chosen = stages[Number(val)];
						this.selectedStage = chosen;
						this.ensurePersonaFromName(chosen.persona);
					}
					this.selectedMilestone = undefined;
					this.selectedObjective = undefined;
					this.selectedTaskParent = undefined;
					this.renderForm();
				});
			});

		return true;
	}

	private renderMilestoneDropdown(mandatory: boolean, name: string, desc: string): boolean {
		const milestones = this.filterMilestones(getMilestones(this.app));
		if (milestones.length === 0) {
			if (mandatory) {
				this.formContainerEl.createEl('p', {
					text: 'No Milestones found for the selected criteria. Please create a Milestone first.',
					cls: 'persona-warning-text'
				});
				return false;
			}
			return true;
		}

		if (mandatory && (!this.selectedMilestone || !milestones.some(m => m.path === this.selectedMilestone?.path))) {
			this.selectedMilestone = milestones[0];
		}

		new Setting(this.formContainerEl)
			.setName(name)
			.setDesc(desc)
			.addDropdown(dropdown => {
				if (!mandatory) dropdown.addOption('', 'All Milestones');
				milestones.forEach((m, idx) => {
					dropdown.addOption(String(idx), `${m.name} (${m.persona} → ${m.stage})`);
				});
				const idx = milestones.findIndex(m => m.path === this.selectedMilestone?.path);
				dropdown.setValue(idx >= 0 ? String(idx) : '');
				dropdown.onChange(val => {
					if (val === '') {
						this.selectedMilestone = undefined;
					} else {
						const chosen = milestones[Number(val)];
						this.selectedMilestone = chosen;
						this.ensureStageFromNames(chosen.persona, chosen.stage);
					}
					this.selectedObjective = undefined;
					this.selectedTaskParent = undefined;
					this.renderForm();
				});
			});

		return true;
	}

	private renderObjectiveDropdown(mandatory: boolean, name: string, desc: string): boolean {
		const objectives = this.filterObjectives(getObjectives(this.app));
		if (objectives.length === 0) {
			if (mandatory) {
				this.formContainerEl.createEl('p', {
					text: 'No Objectives found for the selected criteria. Please create an Objective first.',
					cls: 'persona-warning-text'
				});
				return false;
			}
			return true;
		}

		if (mandatory && (!this.selectedObjective || !objectives.some(o => o.path === this.selectedObjective?.path))) {
			this.selectedObjective = objectives[0];
		}

		new Setting(this.formContainerEl)
			.setName(name)
			.setDesc(desc)
			.addDropdown(dropdown => {
				if (!mandatory) dropdown.addOption('', 'All Objectives');
				objectives.forEach((o, idx) => {
					dropdown.addOption(String(idx), `${o.name} (${o.persona} → ${o.stage} → ${o.milestone})`);
				});
				const idx = objectives.findIndex(o => o.path === this.selectedObjective?.path);
				dropdown.setValue(idx >= 0 ? String(idx) : '');
				dropdown.onChange(val => {
					if (val === '') {
						this.selectedObjective = undefined;
					} else {
						const chosen = objectives[Number(val)];
						this.selectedObjective = chosen;
						this.ensureMilestoneFromNames(chosen.persona, chosen.stage, chosen.milestone);
					}
					this.selectedTaskParent = undefined;
					this.renderForm();
				});
			});

		return true;
	}

	private renderTaskParentDropdown(): boolean {
		const quests = this.filterQuestsOrDuties(getQuests(this.app));
		const duties = this.filterQuestsOrDuties(getDuties(this.app));

		const parentOptions: TaskParentOption[] = [
			...quests.map(q => ({
				type: 'quest' as const,
				item: q,
				label: `[Quest] ${q.name} (${q.persona} → ${q.objective})`
			})),
			...duties.map(d => ({
				type: 'duty' as const,
				item: d,
				label: `[Duty] ${d.name} (${d.persona} → ${d.objective})`
			}))
		];

		if (parentOptions.length === 0) {
			this.formContainerEl.createEl('p', {
				text: 'No Quests or Duties found for the selected criteria. Please create a Quest or Duty first.',
				cls: 'persona-warning-text'
			});
			return false;
		}

		if (!this.selectedTaskParent || !parentOptions.some(opt => opt.item.path === this.selectedTaskParent?.item.path)) {
			this.selectedTaskParent = { type: parentOptions[0].type, item: parentOptions[0].item };
		}

		const selectedIdx = parentOptions.findIndex(opt => opt.item.path === this.selectedTaskParent?.item.path);

		new Setting(this.formContainerEl)
			.setName('Add task to which Quest or Duty?')
			.setDesc('Select parent Quest or Duty')
			.addDropdown(dropdown => {
				parentOptions.forEach((opt, idx) => dropdown.addOption(String(idx), opt.label));
				dropdown.setValue(String(selectedIdx >= 0 ? selectedIdx : 0));
				dropdown.onChange(idxStr => {
					const chosen = parentOptions[Number(idxStr)];
					if (chosen) {
						this.selectedTaskParent = { type: chosen.type, item: chosen.item };
						this.ensureObjectiveFromNames(chosen.item.persona, chosen.item.stage, chosen.item.milestone, chosen.item.objective);
						this.renderForm();
					}
				});
			});

		return true;
	}

	// ---- Forms ----

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
		if (!this.renderPersonaDropdown(true, 'Add stage to which persona?', 'Select parent Persona')) return;

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
		if (!this.renderPersonaDropdown(false, 'Persona (optional)', 'Narrow the Stage list by Persona')) return;
		if (!this.renderStageDropdown(true, 'Add milestone to which stage?', 'Select parent Stage')) return;

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
		if (!this.renderPersonaDropdown(false, 'Persona (optional)', 'Narrow the Stage/Milestone list by Persona')) return;
		if (!this.renderStageDropdown(false, 'Stage (optional)', 'Narrow the Milestone list by Stage')) return;
		if (!this.renderMilestoneDropdown(true, 'Add objective to which milestone?', 'Select parent Milestone')) return;

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
		if (!this.renderPersonaDropdown(false, 'Persona (optional)', 'Narrow the search by Persona')) return;
		if (!this.renderStageDropdown(false, 'Stage (optional)', 'Narrow the search by Stage')) return;
		if (!this.renderMilestoneDropdown(false, 'Milestone (optional)', 'Narrow the search by Milestone')) return;
		if (!this.renderObjectiveDropdown(true, 'Add quest to which objective?', 'Select parent Objective')) return;

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

	private renderDutyForm() {
		if (!this.renderPersonaDropdown(false, 'Persona (optional)', 'Narrow the search by Persona')) return;
		if (!this.renderStageDropdown(false, 'Stage (optional)', 'Narrow the search by Stage')) return;
		if (!this.renderMilestoneDropdown(false, 'Milestone (optional)', 'Narrow the search by Milestone')) return;
		if (!this.renderObjectiveDropdown(true, 'Add duty to which objective?', 'Select parent Objective')) return;

		new Setting(this.formContainerEl)
			.setName('Duty Name')
			.setDesc('Enter duty name (e.g. "Maintain Gallery Plugin")')
			.addText(text => {
				text.setPlaceholder('Duty Name')
					.setValue(this.elementName)
					.onChange(val => { this.elementName = val; });
			});

		new Setting(this.formContainerEl)
			.setName('Status')
			.setDesc('Status of the duty')
			.addDropdown(dropdown => {
				dropdown
					.addOption('active', 'Active')
					.addOption('future', 'Future')
					.addOption('completed', 'Completed')
					.setValue(this.dutyStatus)
					.onChange(val => { this.dutyStatus = val as QuestStatus; });
			});
	}

	private renderTaskForm() {
		if (!this.renderPersonaDropdown(false, 'Persona (optional)', 'Narrow the search by Persona')) return;
		if (!this.renderStageDropdown(false, 'Stage (optional)', 'Narrow the search by Stage')) return;
		if (!this.renderMilestoneDropdown(false, 'Milestone (optional)', 'Narrow the search by Milestone')) return;
		if (!this.renderObjectiveDropdown(false, 'Objective (optional)', 'Narrow the search by Objective')) return;
		if (!this.renderTaskParentDropdown()) return;

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
					createdFile = await createQuest(this.app, this.selectedObjective, name, this.questStatus, this.plugin.settings);
					break;

				case 'duty':
					if (!this.selectedObjective) {
						new Notice('Please select a parent Objective.');
						return;
					}
					createdFile = await createDuty(this.app, this.selectedObjective, name, this.dutyStatus, this.plugin.settings);
					break;

				case 'task':
					if (!this.selectedTaskParent) {
						new Notice('Please select a parent Quest or Duty.');
						return;
					}
					createdFile = await createTask(this.app, this.selectedTaskParent.item, name, this.plugin.settings, this.selectedTaskParent.type);
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
