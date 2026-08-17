import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type MyPlugin from '../main';
import {
	hasSupabaseConfig,
	supabaseSelect,
	supabaseInvoke,
	testSupabaseConnection,
	TrackedRepoRow,
	LichessConfigRow,
	GithubAdminSetReposResponse,
	GithubAdminTestTokenResponse,
	GithubAdminTestRepoResponse,
	GithubAdminBackfillStarsResponse,
	LichessAdminResponse,
	LichessAdminBackfillResponse,
	FrameworkSyncResponse
} from './utils/supabase';
import { computeFrameworkProgress } from './utils/framework-progress';

interface EditableRepo {
	repo: string;
	releasePeriodDays?: number;
}
import {
	isDesktop,
	checkSupabaseCli,
	getLinkedProjectRef,
	linkProject,
	pushSchema,
	deployFunctions,
	setGithubSecret,
	CliResult
} from './utils/supabase-cli';

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

		container.createEl('h2', { text: 'Supabase Connection' });
		container.createEl('p', {
			cls: 'setting-item-description',
			text: 'Both the Obsidian Guru and Mental Gymnast dashboards are backed by Supabase — connect your project here.'
		});

		new Setting(container)
			.setName('Supabase Project URL')
			.setDesc('e.g. https://your-project-ref.supabase.co')
			.addText(text => text
				.setPlaceholder('https://your-project-ref.supabase.co')
				.setValue(this.plugin.settings.supabaseUrl ?? '')
				.onChange(async (value) => {
					this.plugin.settings.supabaseUrl = value.trim();
					await this.plugin.saveSettings();
				}));

		let supabaseKeyInputEl: HTMLInputElement;
		let isEditingSupabaseKey = false;

		new Setting(container)
			.setName('Supabase Anon (Public) Key')
			.setDesc('The project\'s anon/public API key — safe to store here, it can only read the dashboard views (see supabase/migrations/0001_init.sql).')
			.addText(text => {
				supabaseKeyInputEl = text.inputEl;
				supabaseKeyInputEl.type = 'password';
				supabaseKeyInputEl.disabled = true;
				text.setPlaceholder('eyJhbGciOi...')
					.setValue(this.plugin.settings.supabaseAnonKey ?? '')
					.onChange(async (value) => {
						this.plugin.settings.supabaseAnonKey = value.trim();
						await this.plugin.saveSettings();
					});
			})
			.addButton(btn => {
				btn.setButtonText('Edit')
					.onClick(() => {
						isEditingSupabaseKey = !isEditingSupabaseKey;
						supabaseKeyInputEl.disabled = !isEditingSupabaseKey;
						btn.setButtonText(isEditingSupabaseKey ? 'Save' : 'Edit');
						if (isEditingSupabaseKey) supabaseKeyInputEl.focus();
					});
			})
			.addButton(btn => {
				btn.setButtonText('Test Connection')
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText('Testing...');
						const result = await testSupabaseConnection(this.plugin);
						btn.setDisabled(false);
						btn.setButtonText('Test Connection');

						if (result.success) {
							new Notice('✅ Supabase connection successful!');
						} else {
							new Notice(`❌ Supabase connection failed: ${result.error}`);
						}
					});
			});

		container.createEl('h2', { text: 'Framework Progress Sync' });
		container.createEl('p', {
			cls: 'setting-item-description',
			text: 'Sync your vault\'s persona/quest/duty/task progress to Supabase for visualization in the dashboards. This reads all frontmatter from your vault.'
		});

		new Setting(container)
			.setName('Sync Framework Progress Now')
			.setDesc('Scans your vault and uploads progress metrics for all personas to Supabase.')
			.addButton(btn => {
				btn.setButtonText('Sync Now')
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText('Syncing...');
						try {
							const progress = await computeFrameworkProgress(this.app);
							const today = new Date().toISOString().split('T')[0];
							const response = await supabaseInvoke<FrameworkSyncResponse>(
								this.plugin,
								'framework-sync',
								{ snapshotDate: today, personas: progress }
							);

							btn.setDisabled(false);
							btn.setButtonText('Sync Now');

							if (response.ok) {
								new Notice(`✅ Synced ${response.personasProcessed} personas, ${response.habitsProcessed} habit streaks.`);
							} else {
								new Notice(`❌ Sync failed: ${response.error}`);
							}
						} catch (err) {
							btn.setDisabled(false);
							btn.setButtonText('Sync Now');
							new Notice(`❌ Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
						}
					});
			});

		this.renderSupabaseCliSetup(container);
	}

	private renderSupabaseCliSetup(container: HTMLElement): void {
		container.createEl('h2', { text: 'Supabase CLI Setup' });

		if (!isDesktop()) {
			container.createEl('p', {
				cls: 'setting-item-description',
				text: 'CLI setup (Link / Push / Deploy) is only available in the Obsidian desktop app. The dashboards themselves work fine on mobile — they only ever make plain HTTP calls to Supabase, never the CLI.'
			});
			return;
		}

		container.createEl('p', {
			cls: 'setting-item-description',
			text: 'Drives the supabase CLI directly from here, running it in this plugin\'s folder. Requires the CLI installed and on PATH (npm install -g supabase, or see supabase.com/docs/guides/cli).'
		});

		const cliStatusEl = container.createEl('p', { cls: 'setting-item-description', text: 'Checking for the Supabase CLI...' });
		checkSupabaseCli().then(result => {
			cliStatusEl.setText(result.available
				? `✅ Supabase CLI found (${result.version})`
				: '❌ Supabase CLI not found on PATH — install it before using the buttons below.');
		});

		const linkedRef = getLinkedProjectRef(this.plugin);
		container.createEl('p', {
			cls: 'setting-item-description',
			text: linkedRef ? `🔗 Currently linked to project: ${linkedRef}` : 'Not linked to a project yet.'
		});

		let accessTokenInputEl: HTMLInputElement;
		let isEditingAccessToken = false;

		new Setting(container)
			.setName('Supabase Access Token')
			.setDesc('Personal access token used to authenticate the CLI — generate one at supabase.com/dashboard/account/tokens. This grants account-level access; treat it like a password.')
			.addText(text => {
				accessTokenInputEl = text.inputEl;
				accessTokenInputEl.type = 'password';
				accessTokenInputEl.disabled = true;
				text.setPlaceholder('sbp_...')
					.setValue(this.plugin.settings.supabaseAccessToken ?? '')
					.onChange(async (value) => {
						this.plugin.settings.supabaseAccessToken = value.trim();
						await this.plugin.saveSettings();
					});
			})
			.addButton(btn => {
				btn.setButtonText('Edit')
					.onClick(() => {
						isEditingAccessToken = !isEditingAccessToken;
						accessTokenInputEl.disabled = !isEditingAccessToken;
						btn.setButtonText(isEditingAccessToken ? 'Save' : 'Edit');
						if (isEditingAccessToken) accessTokenInputEl.focus();
					});
			});

		new Setting(container)
			.setName('Project Ref')
			.setDesc('The subdomain segment of your project URL, e.g. "abcdefghijklmnop".')
			.addText(text => text
				.setPlaceholder('your-project-ref')
				.setValue(this.plugin.settings.supabaseProjectRef ?? '')
				.onChange(async (value) => {
					this.plugin.settings.supabaseProjectRef = value.trim();
					await this.plugin.saveSettings();
				}));

		let dbPasswordInputEl: HTMLInputElement;
		let isEditingDbPassword = false;

		new Setting(container)
			.setName('Database Password')
			.setDesc('Set when you created the project. Used only for Link and Push, passed directly to the local supabase process.')
			.addText(text => {
				dbPasswordInputEl = text.inputEl;
				dbPasswordInputEl.type = 'password';
				dbPasswordInputEl.disabled = true;
				text.setPlaceholder('Database password')
					.setValue(this.plugin.settings.supabaseDbPassword ?? '')
					.onChange(async (value) => {
						this.plugin.settings.supabaseDbPassword = value;
						await this.plugin.saveSettings();
					});
			})
			.addButton(btn => {
				btn.setButtonText('Edit')
					.onClick(() => {
						isEditingDbPassword = !isEditingDbPassword;
						dbPasswordInputEl.disabled = !isEditingDbPassword;
						btn.setButtonText(isEditingDbPassword ? 'Save' : 'Edit');
						if (isEditingDbPassword) dbPasswordInputEl.focus();
					});
			});

		let githubPatInputEl: HTMLInputElement;
		let isEditingGithubPat = false;

		new Setting(container)
			.setName('GitHub Personal Access Token (server secret)')
			.setDesc('Becomes the GITHUB_TOKEN secret the Edge Functions use to call the GitHub API — distinct from the Supabase tokens above.')
			.addText(text => {
				githubPatInputEl = text.inputEl;
				githubPatInputEl.type = 'password';
				githubPatInputEl.disabled = true;
				text.setPlaceholder('ghp_...')
					.setValue(this.plugin.settings.githubPersonalAccessToken ?? '')
					.onChange(async (value) => {
						this.plugin.settings.githubPersonalAccessToken = value.trim();
						await this.plugin.saveSettings();
					});
			})
			.addButton(btn => {
				btn.setButtonText('Edit')
					.onClick(() => {
						isEditingGithubPat = !isEditingGithubPat;
						githubPatInputEl.disabled = !isEditingGithubPat;
						btn.setButtonText(isEditingGithubPat ? 'Save' : 'Edit');
						if (isEditingGithubPat) githubPatInputEl.focus();
					});
			});

		container.createEl('h3', { text: 'Run Setup Steps' });
		container.createEl('p', {
			cls: 'setting-item-description',
			text: 'Run in order the first time: Link → Push Schema → Deploy Functions → Set GitHub Secret. Safe to re-run any of these any time after — Link re-links, Push re-applies migrations, Deploy re-deploys.'
		});

		const logEl = container.createEl('pre', { cls: 'supabase-cli-log', text: 'Command output will appear here.' });

		const writeLog = (title: string, result: CliResult) => {
			const lines = [`$ supabase ${title}`, result.stdout.trim(), result.stderr.trim()].filter(Boolean);
			logEl.setText(lines.join('\n\n'));
		};

		const actionsRow = container.createDiv({ cls: 'supabase-cli-actions-row' });

		const makeActionButton = (label: string, commandLabel: string, initialBadgeText: string, run: () => Promise<CliResult>) => {
			const wrapper = actionsRow.createDiv({ cls: 'supabase-cli-action' });
			const badge = wrapper.createSpan({ cls: 'supabase-cli-badge', text: initialBadgeText });
			const button = wrapper.createEl('button', { cls: 'dashboard-btn', text: label });

			button.addEventListener('click', async () => {
				button.disabled = true;
				badge.setText('Running...');
				badge.className = 'supabase-cli-badge is-running';

				const result = await run();
				writeLog(commandLabel, result);

				button.disabled = false;
				if (result.success) {
					badge.setText('Active ✓');
					badge.className = 'supabase-cli-badge is-success';
				} else {
					badge.setText('Failed');
					badge.className = 'supabase-cli-badge is-failed';

					// Link/Push need a raw Postgres TCP connection (port 5432 or
					// 6543), which some firewalls/ISPs block even though HTTPS
					// works fine — this is the single most common failure here.
					if (/dial (error|tcp)|i\/o timeout|ETIMEDOUT|ECONNREFUSED/i.test(result.stderr)) {
						new Notice(
							'⚠️ Could not reach the database port (5432/6543) — likely blocked by a firewall or your network. ' +
							'Apply the migrations via the Supabase Dashboard\'s SQL Editor instead (paste supabase/migrations/*.sql there and run) — that only needs HTTPS.',
							12000
						);
					}
				}
			});
		};

		makeActionButton('Link', 'link --project-ref ...', linkedRef ? 'Active ✓' : 'Not linked', () => linkProject(this.plugin));
		makeActionButton('Push Schema', 'db push', 'Not run yet', () => pushSchema(this.plugin));
		makeActionButton('Deploy Functions', 'functions deploy', 'Not run yet', () => deployFunctions(this.plugin));
		makeActionButton('Set GitHub Secret', 'secrets set GITHUB_TOKEN=...', 'Not run yet', () => setGithubSecret(this.plugin));
	}

	private renderGuruSettings(container: HTMLElement): void {
		container.createEl('h2', { text: 'Obsidian Guru Persona Settings' });

		if (!hasSupabaseConfig(this.plugin)) {
			container.createEl('p', {
				cls: 'setting-item-description',
				text: 'Connect Supabase in the General tab first — repository tracking and the GitHub token both live there now.'
			});
			return;
		}

		// GitHub access is now a server-side secret (supabase secrets set
		// GITHUB_TOKEN=...), not a plugin setting — only a connectivity test
		// remains here.
		new Setting(container)
			.setName('GitHub Access')
			.setDesc('GitHub API access is configured server-side. Run `supabase secrets set GITHUB_TOKEN=<token>` from your terminal, then test it here.')
			.addButton(btn => {
				btn.setButtonText('Test Connection')
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText('Testing...');
						try {
							const result = await supabaseInvoke<GithubAdminTestTokenResponse>(this.plugin, 'github-admin', { action: 'test_token' });
							if (result.success) {
								new Notice(`✅ GITHUB_TOKEN validated! Authenticated as @${result.username}`);
							} else {
								new Notice(`❌ GITHUB_TOKEN validation failed: ${result.error}`);
							}
						} catch (err) {
							new Notice(`❌ Test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
						}
						btn.setDisabled(false);
						btn.setButtonText('Test Connection');
					});
			});

		this.renderTrackedReposSection(container);

		// Mental Gymnast Settings
		let lichessUsernameInputEl: HTMLInputElement;
		let isEditingLichessUsername = false;

		new Setting(container)
			.setName('Mental Gymnast: Lichess Username')
			.setDesc('Your Lichess username used to track chess rapid ratings. Changes are saved to Supabase.')
			.addText(text => {
				lichessUsernameInputEl = text.inputEl;
				lichessUsernameInputEl.disabled = true;
				text.setPlaceholder('Loading...');
			})
			.addButton(btn => {
				btn.setButtonText('Edit')
					.onClick(async () => {
						if (!isEditingLichessUsername) {
							isEditingLichessUsername = true;
							lichessUsernameInputEl.disabled = false;
							btn.setButtonText('Save');
							lichessUsernameInputEl.focus();
							return;
						}

						btn.setDisabled(true);
						btn.setButtonText('Saving...');
						try {
							const result = await supabaseInvoke<LichessAdminResponse>(this.plugin, 'lichess-admin', {
								action: 'set_username',
								username: lichessUsernameInputEl.value.trim()
							});
							lichessUsernameInputEl.value = result.username;
							new Notice(`✅ Lichess username saved: ${result.username}`);
							isEditingLichessUsername = false;
							lichessUsernameInputEl.disabled = true;
							btn.setButtonText('Edit');
						} catch (err) {
							new Notice(`❌ Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
							btn.setButtonText('Save');
						}
						btn.setDisabled(false);
					});
			})
			.addButton(btn => {
				btn.setButtonText('Backfill History')
					.setTooltip('Pulls your full rapid-rating history from Lichess\'s official rating-history endpoint')
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText('Backfilling...');
						try {
							const result = await supabaseInvoke<LichessAdminBackfillResponse>(this.plugin, 'lichess-admin', { action: 'backfill_rating' });
							if (result.ok) {
								new Notice(result.daysBackfilled
									? `✅ Backfilled ${result.daysBackfilled} day(s) of rating history (${result.earliestDate} → ${result.latestDate}).`
									: '✅ No rapid rating history found for this account.');
							} else {
								new Notice(`❌ Backfill failed: ${result.error}`);
							}
						} catch (err) {
							new Notice(`❌ Backfill failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
						}
						btn.setDisabled(false);
						btn.setButtonText('Backfill History');
					});
			});

		supabaseSelect<LichessConfigRow>(this.plugin, 'v_lichess_config').then(rows => {
			if (isEditingLichessUsername) return;
			lichessUsernameInputEl.value = rows[0]?.username || '';
		});
	}

	/**
	 * Row-based repo editor: one row per tracked repo with a dedicated name
	 * field, a dedicated release-period (days) field, a Test button that
	 * validates the name against GitHub without saving anything, and
	 * Save/Remove. Every mutation round-trips through github-admin's
	 * set_repos (full-replace semantics) and re-renders from its canonical
	 * response, so the list on screen always matches what's actually stored.
	 */
	private renderTrackedReposSection(container: HTMLElement): void {
		container.createEl('h3', { text: 'Tracked GitHub Repositories' });
		container.createEl('p', {
			cls: 'setting-item-description',
			text: 'Add repositories to track. Release period (days) is optional — set it to flag overdue releases on the dashboard.'
		});

		const listEl = container.createDiv({ cls: 'guru-repo-list' });
		listEl.createEl('p', { cls: 'setting-item-description', text: 'Loading tracked repositories...' });

		let repos: EditableRepo[] = [];

		const saveRepos = async (updated: EditableRepo[]): Promise<boolean> => {
			try {
				const result = await supabaseInvoke<GithubAdminSetReposResponse>(this.plugin, 'github-admin', { action: 'set_repos', repos: updated });
				repos = result.active.map(r => ({ repo: r.repo, releasePeriodDays: r.releasePeriodDays }));
				renderList();
				return true;
			} catch (err) {
				new Notice(`❌ Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
				return false;
			}
		};

		const testRepoName = async (repoName: string, statusEl: HTMLElement, btn: HTMLButtonElement) => {
			const trimmed = repoName.trim();
			if (!trimmed) {
				new Notice('⚠️ Enter a repository name first (owner/repo).');
				return;
			}
			btn.disabled = true;
			btn.setText('Testing...');
			try {
				const result = await supabaseInvoke<GithubAdminTestRepoResponse>(this.plugin, 'github-admin', { action: 'test_repo', repo: trimmed });
				if (result.success && result.repo) {
					statusEl.setText(`✅ ${result.repo.full_name} — ${result.repo.stargazers_count} stars`);
					statusEl.className = 'guru-repo-test-status is-success';
				} else {
					statusEl.setText(`❌ ${result.error || 'Not found'}`);
					statusEl.className = 'guru-repo-test-status is-failed';
				}
			} catch (err) {
				statusEl.setText(`❌ ${err instanceof Error ? err.message : 'Test failed'}`);
				statusEl.className = 'guru-repo-test-status is-failed';
			}
			btn.disabled = false;
			btn.setText('Test');
		};

		const renderList = () => {
			listEl.empty();

			if (repos.length === 0) {
				listEl.createEl('p', { cls: 'setting-item-description', text: 'No repositories tracked yet — add one below.' });
			}

			repos.forEach((repoEntry, index) => {
				const row = listEl.createDiv({ cls: 'guru-repo-row' });

				const nameInput = row.createEl('input', { cls: 'guru-repo-row-name', type: 'text', value: repoEntry.repo });
				nameInput.setAttr('placeholder', 'owner/repo');

				const periodInput = row.createEl('input', { cls: 'guru-repo-row-period', type: 'number' });
				periodInput.setAttr('placeholder', 'days');
				periodInput.setAttr('min', '1');
				if (repoEntry.releasePeriodDays !== undefined) periodInput.value = String(repoEntry.releasePeriodDays);

				const testBtn = row.createEl('button', { cls: 'dashboard-btn', text: 'Test' });
				const saveBtn = row.createEl('button', { cls: 'dashboard-btn', text: 'Save' });
				const backfillBtn = row.createEl('button', { cls: 'dashboard-btn', text: 'Backfill History', title: 'Reconstruct star history from GitHub\'s stargazer timestamps' });
				const removeBtn = row.createEl('button', { cls: 'dashboard-btn guru-repo-row-remove', text: 'Remove' });

				const statusEl = row.createDiv({ cls: 'guru-repo-test-status' });

				testBtn.addEventListener('click', () => testRepoName(nameInput.value, statusEl, testBtn));

				backfillBtn.addEventListener('click', async () => {
					backfillBtn.disabled = true;
					backfillBtn.setText('Backfilling...');
					try {
						const result = await supabaseInvoke<GithubAdminBackfillStarsResponse>(this.plugin, 'github-admin', { action: 'backfill_stars', repo: repoEntry.repo });
						if (result.ok) {
							statusEl.setText(`✅ Backfilled ${result.daysBackfilled} day(s) of star history (${result.totalStars} total stars)${result.truncated ? ' — capped at 3000 stars' : ''}.`);
							statusEl.className = 'guru-repo-test-status is-success';
							new Notice(`✅ Star history backfilled for ${repoEntry.repo}`);
						} else {
							statusEl.setText(`❌ ${result.error || 'Backfill failed'}`);
							statusEl.className = 'guru-repo-test-status is-failed';
						}
					} catch (err) {
						statusEl.setText(`❌ ${err instanceof Error ? err.message : 'Backfill failed'}`);
						statusEl.className = 'guru-repo-test-status is-failed';
					}
					backfillBtn.disabled = false;
					backfillBtn.setText('Backfill History');
				});

				saveBtn.addEventListener('click', async () => {
					const newName = nameInput.value.trim();
					if (!newName) {
						new Notice('⚠️ Repository name cannot be empty.');
						return;
					}
					const daysRaw = periodInput.value.trim();
					const days = daysRaw ? parseInt(daysRaw, 10) : undefined;

					saveBtn.disabled = true;
					saveBtn.setText('Saving...');
					const updated = repos.map((r, i) => i === index
						? { repo: newName, releasePeriodDays: days !== undefined && !isNaN(days) ? days : undefined }
						: r);
					const ok = await saveRepos(updated);
					if (ok) new Notice(`✅ Saved ${newName}`);
					saveBtn.disabled = false;
					saveBtn.setText('Save');
				});

				removeBtn.addEventListener('click', async () => {
					removeBtn.disabled = true;
					removeBtn.setText('Removing...');
					const updated = repos.filter((_, i) => i !== index);
					const ok = await saveRepos(updated);
					if (ok) new Notice(`Removed ${repoEntry.repo}`);
					removeBtn.disabled = false;
				});
			});

			// Add-new row
			const addRow = listEl.createDiv({ cls: 'guru-repo-row guru-repo-row-add' });

			const addNameInput = addRow.createEl('input', { cls: 'guru-repo-row-name', type: 'text' });
			addNameInput.setAttr('placeholder', 'owner/repo');

			const addPeriodInput = addRow.createEl('input', { cls: 'guru-repo-row-period', type: 'number' });
			addPeriodInput.setAttr('placeholder', 'days (optional)');
			addPeriodInput.setAttr('min', '1');

			const addTestBtn = addRow.createEl('button', { cls: 'dashboard-btn', text: 'Test' });
			const addBtn = addRow.createEl('button', { cls: 'dashboard-btn', text: '+ Add' });
			const addStatusEl = addRow.createDiv({ cls: 'guru-repo-test-status' });

			addTestBtn.addEventListener('click', () => testRepoName(addNameInput.value, addStatusEl, addTestBtn));

			addBtn.addEventListener('click', async () => {
				const newName = addNameInput.value.trim();
				if (!newName) {
					new Notice('⚠️ Enter a repository name (owner/repo).');
					return;
				}
				if (repos.some(r => r.repo.toLowerCase() === newName.toLowerCase())) {
					new Notice('⚠️ That repository is already tracked.');
					return;
				}
				const daysRaw = addPeriodInput.value.trim();
				const days = daysRaw ? parseInt(daysRaw, 10) : undefined;

				addBtn.disabled = true;
				addBtn.setText('Adding...');
				const updated = [...repos, { repo: newName, releasePeriodDays: days !== undefined && !isNaN(days) ? days : undefined }];
				const ok = await saveRepos(updated);
				if (ok) new Notice(`✅ Added ${newName}`);
				addBtn.disabled = false;
				addBtn.setText('+ Add');
			});
		};

		supabaseSelect<TrackedRepoRow>(this.plugin, 'v_tracked_repos').then(rows => {
			repos = rows.map(r => ({ repo: r.repo_full_name, releasePeriodDays: r.release_period_days ?? undefined }));
			renderList();
		});
	}
}
