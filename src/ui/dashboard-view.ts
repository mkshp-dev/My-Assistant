import { ItemView, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import type MyPlugin from '../../main';
import { ZenQuote, UnsplashPhoto } from '../types';
import { fetchZenQuote } from '../utils/zenquotes';
import { fetchUnsplashPhoto } from '../utils/unsplash';
import {
	hasSupabaseConfig,
	supabaseSelect,
	supabaseInvoke,
	TrackedRepoRow,
	RepoLatestRow,
	RepoStarHistoryRow,
	RepoEventRow,
	LichessLatestRow,
	LichessRatingHistoryRow,
	PersonaProgressLatestRow,
	PersonaProgressHistoryRow,
	HabitStreakRow,
	GithubRefreshResponse,
	LichessRefreshResponse,
	FrameworkSyncResponse
} from '../utils/supabase';
import { renderHistoryChart, HistoryChartSeries, CATEGORICAL_PALETTE } from './history-chart';
import { renderStatTile, renderProgressBar } from './widgets';
import { computeFrameworkProgress } from '../utils/framework-progress';

export const DASHBOARD_VIEW_TYPE = 'my-assistant-dashboard';

interface PersonaDashboardConfig {
	id: string;
	label: string;
	personaName: string;
	coverAsset?: string;
	renderBespoke?: (container: HTMLElement, mainWrapper: HTMLElement) => void | Promise<void>;
}

const PERSONA_DASHBOARDS: PersonaDashboardConfig[] = [
	{ id: 'central', label: 'Central Dashboard', personaName: '' },
	{ id: 'a-phd', label: 'A PhD', personaName: 'A PhD' },
	{ id: 'amazing-athlete', label: 'Amazing Athlete', personaName: 'Amazing Athlete' },
	{ id: 'career-architect', label: 'Career Architect', personaName: 'Career Architect' },
	{ id: 'heart-maestro', label: 'Heart Maestro', personaName: 'Heart Maestro' },
	{ id: 'mental-gymnast', label: 'Mental Gymnast', personaName: 'Mental Gymnast' },
	{ id: 'obsidian-guru', label: 'Obsidian Guru', personaName: 'Obsidian Guru' },
	{ id: 'open-source-maseiha', label: 'Open Source Maseiha', personaName: 'Open Source Maseiha' },
	{ id: 'prosperity-engineer', label: 'Prosperity Engineer', personaName: 'Prosperity Engineer' },
	{ id: 'super-hustler', label: 'Super Hustler', personaName: 'Super Hustler' },
	{ id: 'the-grounded-one', label: 'The Grounded One', personaName: 'The Grounded One' }
];

const REPO_STACK_CARD_OFFSET = 20;
const REPO_STACK_CARD_HEIGHT = 240;
const REPO_STACK_CARD_WIDTH = 300;

/** Step-interpolated value of a sparse, date-sorted series as of `date` (last known value at or before it). */
function valueAsOf(points: HistoryChartSeries['points'], date: string): number {
	let value = 0;
	for (const p of points) {
		if (p.date > date) break;
		value = p.value;
	}
	return value;
}

export class DashboardView extends ItemView {
	plugin: MyPlugin;
	private activeTabId: string = 'central';
	private selectedStarRepo: string = 'all';
	private repoStackOrder: string[] = [];
	private lastFrameworkSyncDate: string = '';

	private currentQuote: ZenQuote | null = null;
	private currentPhoto: UnsplashPhoto | null = null;
	private clockEl: HTMLElement | null = null;
	private dateEl: HTMLElement | null = null;
	private quoteEl: HTMLElement | null = null;
	private authorEl: HTMLElement | null = null;
	private bgLayerEl: HTMLElement | null = null;
	private creditEl: HTMLElement | null = null;
	private contentContainerEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.setupPersonaDashboardsWithBespoke();
	}

	private setupPersonaDashboardsWithBespoke(): void {
		const guruConfig = PERSONA_DASHBOARDS.find(p => p.personaName === 'Obsidian Guru');
		const gymnastConfig = PERSONA_DASHBOARDS.find(p => p.personaName === 'Mental Gymnast');

		if (guruConfig) guruConfig.renderBespoke = (c, m) => this.renderObsidianGuruContent(c, m);
		if (gymnastConfig) gymnastConfig.renderBespoke = (c, m) => this.renderMentalGymnastContent(c, m);
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Persona Dashboards';
	}

	getIcon(): string {
		return 'layout-dashboard';
	}

	async onOpen(): Promise<void> {
		this.renderDashboard();
	}

	private renderDashboard(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		const root = container.createDiv({ cls: 'my-assistant-dashboard' });

		// Background layer
		this.bgLayerEl = root.createDiv({ cls: 'dashboard-bg-layer' });
		root.createDiv({ cls: 'dashboard-overlay' });

		// Main container
		const mainWrapper = root.createDiv({ cls: 'dashboard-content-container' });

		// Top-right Persona Switcher Dropdown
		const topBar = mainWrapper.createDiv({ cls: 'dashboard-top-bar' });

		const selectorContainer = topBar.createDiv({ cls: 'dashboard-persona-selector-container' });
		const activeTabConfig = PERSONA_DASHBOARDS.find(t => t.id === this.activeTabId);
		const currentLabel = activeTabConfig?.label || 'Central Dashboard';

		const selectorBtn = selectorContainer.createEl('button', {
			cls: 'dashboard-persona-selector-btn',
			text: currentLabel
		});
		setIcon(selectorBtn, 'chevron-down');

		const dropdown = selectorContainer.createDiv({ cls: 'dashboard-persona-dropdown' });
		dropdown.style.display = 'none';

		selectorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
		});

		// Populate dropdown with all personas
		for (const tabConfig of PERSONA_DASHBOARDS) {
			const item = dropdown.createEl('div', {
				cls: `dashboard-dropdown-item ${this.activeTabId === tabConfig.id ? 'is-active' : ''}`,
				text: tabConfig.label
			});
			item.addEventListener('click', () => {
				if (this.activeTabId !== tabConfig.id) {
					this.activeTabId = tabConfig.id;
					dropdown.style.display = 'none';
					this.renderDashboard();
				}
			});
		}

		// Close dropdown when clicking outside
		document.addEventListener('click', (e) => {
			if (!selectorContainer.contains(e.target as Node)) {
				dropdown.style.display = 'none';
			}
		});

		// Dynamic content container
		this.contentContainerEl = mainWrapper.createDiv({ cls: 'dashboard-tab-content' });

		if (activeTabConfig) {
			if (this.activeTabId === 'central') {
				this.renderCentralContent(this.contentContainerEl, mainWrapper);
			} else {
				this.renderPersonaContent(this.contentContainerEl, mainWrapper, activeTabConfig);
			}
		}
	}

	private async renderPersonaContent(contentWrapper: HTMLElement, mainWrapper: HTMLElement, config: PersonaDashboardConfig): Promise<void> {
		contentWrapper.empty();
		if (this.currentPhoto) {
			this.applyBackground(this.currentPhoto);
		} else {
			this.loadBackground();
		}

		// Render the generic framework progress panel
		await this.renderFrameworkProgressPanel(contentWrapper, config.personaName);

		// If this persona has a bespoke renderer (Guru/Gymnast), call it after the generic panel
		if (config.renderBespoke) {
			await config.renderBespoke(contentWrapper, mainWrapper);
		}
	}

	private async renderFrameworkProgressPanel(container: HTMLElement, personaName: string): Promise<void> {
		if (!hasSupabaseConfig(this.plugin)) {
			const emptyState = container.createDiv({ cls: 'framework-empty-state' });
			emptyState.createEl('p', { text: 'Connect Supabase in Settings to see framework progress.' });
			const settingsBtn = emptyState.createEl('button', { cls: 'dashboard-btn', text: 'Open Settings' });
			settingsBtn.addEventListener('click', () => this.openSettings());
			return;
		}

		const panelDiv = container.createDiv({ cls: 'framework-progress-panel' });
		panelDiv.createDiv({ cls: 'framework-loading-msg', text: 'Loading progress...' });

		try {
			const [latestRows, historyRows, habitRows] = await Promise.all([
				supabaseSelect<PersonaProgressLatestRow>(this.plugin, 'v_persona_progress_latest'),
				supabaseSelect<PersonaProgressHistoryRow>(this.plugin, 'v_persona_progress_history'),
				supabaseSelect<HabitStreakRow>(this.plugin, 'v_habit_streaks_latest')
			]);

			panelDiv.empty();

			const latest = latestRows.find(r => r.persona === personaName);
			if (!latest) {
				panelDiv.createDiv({ cls: 'framework-no-data', text: `No framework data synced yet for ${personaName}` });
				return;
			}

			// Header with persona name
			const header = panelDiv.createDiv({ cls: 'framework-header' });
			header.createEl('h3', { text: `${personaName} Progress` });

			// Stats row: active quests, duties, tasks
			const statsGrid = panelDiv.createDiv({ cls: 'framework-stats-grid' });
			renderStatTile(statsGrid, { label: 'Active Quests', value: latest.active_quest_count, icon: '🎯' });
			renderStatTile(statsGrid, { label: 'Active Duties', value: latest.active_duty_count, icon: '📋' });
			renderStatTile(statsGrid, { label: 'Active Tasks', value: latest.active_task_count, icon: '✓' });
			renderStatTile(statsGrid, { label: 'Done Today', value: latest.done_task_count, icon: '✅' });

			// Stage & Milestone progress
			const progressGrid = panelDiv.createDiv({ cls: 'framework-progress-grid' });
			if (latest.active_stage && latest.stage_progress_pct !== null) {
				renderProgressBar(progressGrid, {
					label: `Stage: ${latest.active_stage}`,
					pct: latest.stage_progress_pct,
					sublabel: `${latest.stage_progress_pct}% complete`
				});
			}
			if (latest.active_milestone && latest.milestone_progress_pct !== null) {
				renderProgressBar(progressGrid, {
					label: `Milestone: ${latest.active_milestone}`,
					pct: latest.milestone_progress_pct,
					sublabel: `${latest.milestone_progress_pct}% complete`
				});
			}

			// Habit streaks
			const personaHabits = habitRows.filter(h => h.persona === personaName);
			if (personaHabits.length > 0) {
				const habitsSection = panelDiv.createDiv({ cls: 'framework-habits-section' });
				habitsSection.createEl('h4', { text: 'Habit Streaks' });
				const habitsList = habitsSection.createDiv({ cls: 'framework-habits-list' });

				for (const habit of personaHabits) {
					const habitCard = habitsList.createDiv({ cls: 'framework-habit-card' });
					habitCard.createDiv({ cls: 'framework-habit-name', text: habit.habit_name });
					const streakRow = habitCard.createDiv({ cls: 'framework-habit-streak-row' });
					streakRow.createSpan({ cls: 'framework-streak-number', text: `${habit.current_streak} day streak` });
					if (habit.completed_today) {
						streakRow.createSpan({ cls: 'framework-habit-done-today', text: '✓ Today' });
					}
				}
			}

			// Active/Done task trend chart
			const historyForPersona = historyRows.filter(r => r.persona === personaName);
			if (historyForPersona.length > 1) {
				const chartSection = panelDiv.createDiv({ cls: 'history-section' });
				chartSection.createEl('h4', { text: 'Task Trend' });
				const chartContainer = chartSection.createDiv({ cls: 'history-chart-container' });

				const activeSeries: HistoryChartSeries['points'] = historyForPersona.map(r => ({
					date: r.snapshot_date,
					value: r.active_task_count
				}));
				const doneSeries: HistoryChartSeries['points'] = historyForPersona.map(r => ({
					date: r.snapshot_date,
					value: r.done_task_count
				}));

				renderHistoryChart(chartContainer, [
					{ name: 'Active Tasks', color: CATEGORICAL_PALETTE[0], points: activeSeries },
					{ name: 'Done (today)', color: CATEGORICAL_PALETTE[1], points: doneSeries }
				], {
					emptyMessage: 'Task history will appear after framework sync runs.'
				});
			}
		} catch (err) {
			panelDiv.empty();
			const errorDiv = panelDiv.createDiv({ cls: 'framework-error' });
			errorDiv.createEl('p', { text: 'Failed to load framework progress.' });
			if (err instanceof Error) {
				errorDiv.createSpan({ cls: 'framework-error-detail', text: err.message });
			}
		}
	}

	private renderCentralContent(contentWrapper: HTMLElement, mainWrapper: HTMLElement): void {
		// Apply cached background if available
		if (this.currentPhoto) {
			this.applyBackground(this.currentPhoto);
		}

		// Top Section: Date & Time
		const headerSection = contentWrapper.createDiv({ cls: 'dashboard-header-section' });
		const dateBadge = headerSection.createDiv({ cls: 'dashboard-date-badge' });
		this.dateEl = dateBadge.createSpan({ cls: 'dashboard-date-text' });
		dateBadge.createSpan({ cls: 'dashboard-date-divider', text: ' • ' });
		this.clockEl = dateBadge.createSpan({ cls: 'dashboard-clock-text' });
		this.updateClock();

		// Middle Section: Quote
		const quoteWrapper = contentWrapper.createDiv({ cls: 'dashboard-quote-wrapper' });
		this.quoteEl = quoteWrapper.createDiv({ cls: 'dashboard-quote-text', text: 'Loading quote...' });
		this.authorEl = quoteWrapper.createDiv({ cls: 'dashboard-quote-author', text: '' });

		if (this.currentQuote) {
			this.displayQuote(this.currentQuote);
		}

		// Bottom Container
		const bottomSection = contentWrapper.createDiv({ cls: 'dashboard-bottom-section' });
		this.creditEl = bottomSection.createDiv({ cls: 'dashboard-photo-credit' });
		if (this.currentPhoto) {
			this.displayCredit(this.currentPhoto);
		}

		// Action Toolbar
		const toolbar = bottomSection.createDiv({ cls: 'dashboard-toolbar' });

		const refreshQuoteBtn = toolbar.createEl('button', { cls: 'dashboard-btn', title: 'New quote' });
		setIcon(refreshQuoteBtn, 'refresh-cw');
		refreshQuoteBtn.createSpan({ text: ' New Quote' });
		refreshQuoteBtn.addEventListener('click', () => this.loadQuote('random'));

		const refreshBgBtn = toolbar.createEl('button', { cls: 'dashboard-btn', title: 'New background' });
		setIcon(refreshBgBtn, 'image');
		refreshBgBtn.createSpan({ text: ' New Background' });
		refreshBgBtn.addEventListener('click', () => this.loadBackground());

		const settingsBtn = toolbar.createEl('button', { cls: 'dashboard-btn', title: 'Open Settings' });
		setIcon(settingsBtn, 'settings');
		settingsBtn.createSpan({ text: ' Settings' });
		settingsBtn.addEventListener('click', () => this.openSettings());

		this.registerInterval(window.setInterval(() => this.updateClock(), 1000));
		if (!this.currentQuote) this.loadQuote('today');
		if (!this.currentPhoto) this.loadBackground();
	}

	private async renderObsidianGuruContent(contentWrapper: HTMLElement, mainWrapper: HTMLElement): Promise<void> {
		contentWrapper.empty();
		if (this.currentPhoto) {
			this.applyBackground(this.currentPhoto);
		} else {
			this.loadBackground();
		}

		const header = contentWrapper.createDiv({ cls: 'guru-header' });
		const headerTitleRow = header.createDiv({ cls: 'guru-header-title-row' });

		const titleTextWrapper = headerTitleRow.createDiv({ cls: 'guru-title-text' });
		titleTextWrapper.createEl('h2', { text: 'Obsidian Guru - Plugin Developer Dashboard' });
		titleTextWrapper.createEl('p', { text: 'Track and monitor your Obsidian plugin development repositories in real-time.' });

		const headerActions = headerTitleRow.createDiv({ cls: 'guru-header-actions' });

		// Notification Bell Icon with Dot Indicator
		const notifBellBtn = headerActions.createEl('button', { cls: 'dashboard-btn guru-notif-btn', title: 'Notifications' });
		setIcon(notifBellBtn, 'bell');
		const notifBadgeDot = notifBellBtn.createSpan({ cls: 'guru-notif-dot' });
		notifBadgeDot.style.display = 'none';

		// Refresh Button — invokes the github-refresh Edge Function to pull
		// fresh data from GitHub right now (independent of the daily cron run).
		const refreshBtn = headerActions.createEl('button', { cls: 'dashboard-btn guru-refresh-btn', title: 'Fetch fresh data from GitHub now' });
		const refreshIconSpan = refreshBtn.createSpan({ cls: 'guru-refresh-icon' });
		setIcon(refreshIconSpan, 'refresh-cw');
		refreshBtn.createSpan({ text: ' Refresh' });

		// Popover Panel for Notifications
		const notifDropdown = headerActions.createDiv({ cls: 'guru-notif-dropdown' });
		notifDropdown.style.display = 'none';

		notifBellBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const isVisible = notifDropdown.style.display !== 'none';
			notifDropdown.style.display = isVisible ? 'none' : 'block';
		});

		// Close dropdown when clicking outside
		const closeDropdownHandler = (e: MouseEvent) => {
			if (!headerActions.contains(e.target as Node)) {
				notifDropdown.style.display = 'none';
			}
		};
		document.addEventListener('click', closeDropdownHandler);

		if (!hasSupabaseConfig(this.plugin)) {
			const emptyState = contentWrapper.createDiv({ cls: 'guru-empty-state' });
			emptyState.createEl('p', { text: 'Connect Supabase in Settings to start tracking repositories.' });
			const settingsBtn = emptyState.createEl('button', { cls: 'dashboard-btn', text: 'Open Settings' });
			settingsBtn.addEventListener('click', () => this.openSettings());
			return;
		}

		const bodyContainer = contentWrapper.createDiv({ cls: 'guru-body' });
		bodyContainer.createDiv({ cls: 'guru-loading-msg', text: 'Loading...' });

		// Cheap, Supabase-only reads — no external API calls happen just from
		// opening this tab. All GitHub calls happen server-side, triggered
		// either by the Refresh button below or the daily Supabase cron job.
		const renderFromViews = async () => {
			bodyContainer.empty();

			const [trackedRepos, latestRows, eventRows, starHistoryRows] = await Promise.all([
				supabaseSelect<TrackedRepoRow>(this.plugin, 'v_tracked_repos'),
				supabaseSelect<RepoLatestRow>(this.plugin, 'v_repo_latest'),
				supabaseSelect<RepoEventRow>(this.plugin, 'v_repo_events_recent', 'order=created_at.desc&limit=10'),
				supabaseSelect<RepoStarHistoryRow>(this.plugin, 'v_repo_star_history')
			]);

			if (trackedRepos.length === 0) {
				const emptyState = bodyContainer.createDiv({ cls: 'guru-empty-state' });
				emptyState.createEl('p', { text: 'No repositories configured for tracking.' });
				const settingsBtn = emptyState.createEl('button', { cls: 'dashboard-btn', text: 'Configure Repositories in Settings' });
				settingsBtn.addEventListener('click', () => this.openSettings());
				return;
			}

			// Render Notifications inside Dropdown Popover
			notifDropdown.empty();
			const dropdownHeader = notifDropdown.createDiv({ cls: 'guru-dropdown-header' });
			dropdownHeader.createEl('h4', { text: 'Notifications' });
			dropdownHeader.createSpan({ cls: 'guru-dropdown-sub', text: 'Recent activity' });

			const dropdownList = notifDropdown.createDiv({ cls: 'guru-dropdown-list' });

			if (eventRows.length > 0) {
				notifBadgeDot.style.display = 'inline-block';

				eventRows.forEach(ev => {
					const item = dropdownList.createDiv({ cls: 'guru-notif-item' });

					const top = item.createDiv({ cls: 'guru-notif-top' });
					const titleLink = top.createEl('a', { text: `${ev.repo_full_name}: ${ev.title}`, href: ev.url || '#' });
					titleLink.setAttr('target', '_blank');

					top.createSpan({ cls: 'guru-notif-time', text: new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });

					if (ev.detail) {
						item.createDiv({ cls: 'guru-notif-detail', text: ev.detail });
					}
				});
			} else {
				notifBadgeDot.style.display = 'none';
				dropdownList.createDiv({ cls: 'guru-notif-empty', text: '✨ No recent activity' });
			}

			// Reconcile the card-stack order with the current tracked-repo list:
			// keep existing order, drop removed repos, append any new ones at the back.
			const trackedNames = trackedRepos.map(r => r.repo_full_name);
			this.repoStackOrder = this.repoStackOrder.filter(name => trackedNames.includes(name));
			trackedNames.forEach(name => {
				if (!this.repoStackOrder.includes(name)) this.repoStackOrder.push(name);
			});
			if (this.selectedStarRepo !== 'all' && !trackedNames.includes(this.selectedStarRepo)) {
				this.selectedStarRepo = 'all';
			}

			const latestByRepo = new Map(latestRows.map(r => [r.repo_full_name.toLowerCase(), r]));
			const seriesForRepo = (repoFullName: string): HistoryChartSeries['points'] =>
				starHistoryRows
					.filter(row => row.repo_full_name.toLowerCase() === repoFullName.toLowerCase())
					.map(row => ({ date: row.snapshot_date, value: row.stargazers_count }))
					.sort((a, b) => a.date.localeCompare(b.date));

			// Repo card deck (left) + star history chart (right)
			const dashboardRow = bodyContainer.createDiv({ cls: 'guru-dashboard-row' });
			const stackPanel = dashboardRow.createDiv({ cls: 'guru-repo-stack-panel' });
			const historyPanel = dashboardRow.createDiv({ cls: 'guru-history-panel' });

			const renderStackAndChart = () => {
				// --- Card stack ---
				stackPanel.empty();
				const stackEl = stackPanel.createDiv({ cls: 'guru-repo-stack' });
				const stackHeight = REPO_STACK_CARD_HEIGHT + (this.repoStackOrder.length - 1) * REPO_STACK_CARD_OFFSET;
				const stackWidth = REPO_STACK_CARD_WIDTH + (this.repoStackOrder.length - 1) * REPO_STACK_CARD_OFFSET;
				stackEl.style.height = `${stackHeight}px`;
				stackEl.style.width = `${stackWidth}px`;

				this.repoStackOrder.forEach((name, pos) => {
					const tracked = trackedRepos.find(r => r.repo_full_name === name);
					if (!tracked) return;
					const repo = latestByRepo.get(name.toLowerCase());

					const card = stackEl.createDiv({ cls: 'guru-repo-card guru-repo-stack-card' });
					card.style.zIndex = String(this.repoStackOrder.length - pos);
					card.style.transform = `translate(${pos * REPO_STACK_CARD_OFFSET}px, ${pos * REPO_STACK_CARD_OFFSET}px)`;
					if (pos === 0 && this.selectedStarRepo === name) card.addClass('is-selected');

					const cardHeader = card.createDiv({ cls: 'guru-card-header' });
					const repoLink = cardHeader.createEl('a', {
						text: tracked.repo_full_name,
						href: repo?.html_url || `https://github.com/${tracked.repo_full_name}`
					});
					repoLink.setAttr('target', '_blank');

					if (!repo) {
						card.createDiv({ cls: 'guru-repo-error', text: 'No data yet — click Refresh to fetch.' });
					} else if (repo.fetch_error) {
						card.createDiv({ cls: 'guru-repo-error', text: `Error: ${repo.fetch_error}` });
					} else {
						if (repo.description) {
							card.createDiv({ cls: 'guru-repo-desc', text: repo.description });
						}

						const statsRow = card.createDiv({ cls: 'guru-stats-row' });

						const starStat = statsRow.createDiv({ cls: 'guru-stat-item' });
						setIcon(starStat, 'star');
						starStat.createSpan({ text: ` ${repo.stargazers_count} stars` });

						const issueStat = statsRow.createDiv({ cls: 'guru-stat-item' });
						setIcon(issueStat, 'alert-circle');
						issueStat.createSpan({ text: ` ${repo.open_issues_count} open issues` });

						const forkStat = statsRow.createDiv({ cls: 'guru-stat-item' });
						setIcon(forkStat, 'git-fork');
						forkStat.createSpan({ text: ` ${repo.forks_count} forks` });

						const footer = card.createDiv({ cls: 'guru-card-footer' });
						if (repo.latest_release_tag) {
							const releaseBadge = footer.createDiv({ cls: 'guru-release-badge' });
							setIcon(releaseBadge, 'tag');
							const relLink = releaseBadge.createEl('a', { text: repo.latest_release_tag, href: repo.latest_release_url || repo.html_url });
							relLink.setAttr('target', '_blank');
						} else {
							footer.createDiv({ cls: 'guru-no-release', text: 'No releases' });
						}

						const releaseDate = repo.latest_release_date ? new Date(repo.latest_release_date) : null;
						const now = new Date();

						const releaseTextEl = footer.createDiv({ cls: 'guru-last-push' });
						let daysAgo: number | null = null;

						if (releaseDate) {
							const diffTime = Math.abs(now.getTime() - releaseDate.getTime());
							daysAgo = Math.floor(diffTime / (1000 * 60 * 60 * 24));
							releaseTextEl.createSpan({ text: `Last released ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago` });
						} else {
							releaseTextEl.createSpan({ text: 'Never released' });
						}

						const targetPeriod = repo.release_period_days;
						if (targetPeriod !== null && targetPeriod !== undefined) {
							const isOverdue = daysAgo === null || daysAgo > targetPeriod;
							if (isOverdue) {
								const warningDot = releaseTextEl.createSpan({ cls: 'guru-overdue-dot' });
								warningDot.setAttr('title', `Overdue! Target release period is ${targetPeriod} days.`);
							}
						}
					}

					// Bring this card to the front of the deck and show its history.
					card.addEventListener('click', () => {
						this.repoStackOrder = [name, ...this.repoStackOrder.filter(n => n !== name)];
						this.selectedStarRepo = name;
						renderStackAndChart();
					});
				});

				// --- Star history chart ---
				historyPanel.empty();
				const historySection = historyPanel.createDiv({ cls: 'history-section' });
				const historyHeader = historySection.createDiv({ cls: 'history-header' });
				historyHeader.createEl('h3', {
					text: this.selectedStarRepo === 'all' ? 'Star History — All Repositories' : `Star History — ${this.selectedStarRepo}`
				});

				const allReposPill = historyHeader.createEl('button', {
					cls: `history-select ${this.selectedStarRepo === 'all' ? 'is-active' : ''}`,
					text: 'All Repos (total)'
				});
				allReposPill.addEventListener('click', () => {
					this.selectedStarRepo = 'all';
					renderStackAndChart();
				});

				const historyChartContainer = historySection.createDiv({ cls: 'history-chart-container' });

				let chartSeries: HistoryChartSeries[];
				if (this.selectedStarRepo === 'all') {
					// Sum, not one line per repo: step-interpolate each repo's sparse
					// series at every date any repo changed, then add them up.
					const perRepoSeries = trackedRepos.map(r => seriesForRepo(r.repo_full_name));
					const allDates = Array.from(new Set(perRepoSeries.flat().map(p => p.date))).sort();
					chartSeries = [{
						name: 'All Repositories (total)',
						color: CATEGORICAL_PALETTE[0],
						points: allDates.map(date => ({
							date,
							value: perRepoSeries.reduce((sum, points) => sum + valueAsOf(points, date), 0)
						}))
					}];
				} else {
					const repo = trackedRepos.find(r => r.repo_full_name === this.selectedStarRepo);
					chartSeries = repo ? [{
						name: repo.repo_full_name,
						color: CATEGORICAL_PALETTE[0],
						points: seriesForRepo(repo.repo_full_name)
					}] : [];
				}

				renderHistoryChart(historyChartContainer, chartSeries, {
					emptyMessage: 'Star history will appear here after a day or two of snapshots — check back soon.'
				});
			};

			renderStackAndChart();
		};

		await renderFromViews();

		refreshBtn.addEventListener('click', async () => {
			refreshIconSpan.addClass('spin-anim');
			refreshBtn.disabled = true;
			try {
				const result = await supabaseInvoke<GithubRefreshResponse>(this.plugin, 'github-refresh', {});
				const failed = result.repos.filter(r => !r.ok);
				if (failed.length > 0) {
					new Notice(`⚠️ Refreshed with ${failed.length} error(s): ${failed.map(f => f.repo).join(', ')}`);
				} else {
					new Notice(`✅ Refreshed ${result.repos.length} repo(s), ${result.newEventCount} new event(s).`);
				}
			} catch (err) {
				new Notice(`❌ Refresh failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
			}
			await renderFromViews();
			refreshIconSpan.removeClass('spin-anim');
			refreshBtn.disabled = false;
		});
	}

	private async renderMentalGymnastContent(contentWrapper: HTMLElement, mainWrapper: HTMLElement): Promise<void> {
		contentWrapper.empty();
		if (this.currentPhoto) {
			this.applyBackground(this.currentPhoto);
		} else {
			this.loadBackground();
		}

		const header = contentWrapper.createDiv({ cls: 'gymnast-header' });
		const titleRow = header.createDiv({ cls: 'gymnast-header-title-row' });
		const titleText = titleRow.createDiv({ cls: 'gymnast-title-text' });
		titleText.createEl('h2', { text: 'Mental Gymnast Dashboard' });
		titleText.createEl('p', { text: 'Sharpen your mind and track your cognitive & strategic growth.' });

		// Refresh Button — invokes the lichess-refresh Edge Function to pull a
		// fresh rating right now (independent of the daily cron run).
		const refreshBtn = titleRow.createEl('button', { cls: 'dashboard-btn', title: 'Fetch fresh data from Lichess now' });
		const refreshIconSpan = refreshBtn.createSpan({ cls: 'guru-refresh-icon' });
		setIcon(refreshIconSpan, 'refresh-cw');
		refreshBtn.createSpan({ text: ' Refresh' });

		if (!hasSupabaseConfig(this.plugin)) {
			const container = contentWrapper.createDiv({ cls: 'gymnast-container' });
			const emptyState = container.createDiv({ cls: 'gymnast-error-card' });
			emptyState.createEl('p', { text: 'Connect Supabase in Settings to start tracking your Lichess rating.' });
			const settingsBtn = emptyState.createEl('button', { cls: 'dashboard-btn', text: 'Open Settings' });
			settingsBtn.addEventListener('click', () => this.openSettings());
			return;
		}

		const container = contentWrapper.createDiv({ cls: 'gymnast-container' });
		container.createDiv({ cls: 'gymnast-loading-msg', text: 'Loading...' });

		// Cheap, Supabase-only reads — no external Lichess call happens just
		// from opening this tab; that only happens via Refresh or cron.
		const renderFromViews = async () => {
			container.empty();

			const [latestRows, ratingHistoryRows] = await Promise.all([
				supabaseSelect<LichessLatestRow>(this.plugin, 'v_lichess_latest'),
				supabaseSelect<LichessRatingHistoryRow>(this.plugin, 'v_lichess_rating_history')
			]);

			const latest = latestRows[0];

			if (!latest) {
				const emptyState = container.createDiv({ cls: 'gymnast-error-card' });
				emptyState.createEl('h3', { text: 'No Lichess data yet' });
				emptyState.createEl('p', { text: 'Click Refresh to fetch your rating for the first time.' });
				return;
			}

			if (latest.fetch_error) {
				const errorCard = container.createDiv({ cls: 'gymnast-error-card' });
				errorCard.createEl('h3', { text: `Failed to load Lichess stats for @${latest.username}` });
				errorCard.createEl('p', { text: latest.fetch_error });
				return;
			}

			const row = container.createDiv({ cls: 'gymnast-row' });
			const card = row.createDiv({ cls: 'gymnast-rapid-card' });

			// Top Row: User details & Status
			const cardHeader = card.createDiv({ cls: 'gymnast-card-header' });
			const userTitleRow = cardHeader.createDiv({ cls: 'gymnast-user-title-row' });

			if (latest.title) {
				userTitleRow.createSpan({ cls: 'gymnast-user-badge', text: latest.title });
			}

			const userLink = userTitleRow.createEl('a', { cls: 'gymnast-user-link', text: `@${latest.username}`, href: latest.profile_url });
			userLink.setAttr('target', '_blank');

			const statusDot = userTitleRow.createSpan({ cls: `gymnast-status-dot ${latest.online ? 'is-online' : 'is-offline'}` });
			statusDot.setAttr('title', latest.online ? 'Online on Lichess' : 'Offline');

			// Main Rapid Stat Display
			const statBody = card.createDiv({ cls: 'gymnast-rapid-body' });

			const labelRow = statBody.createDiv({ cls: 'gymnast-rapid-label' });
			setIcon(labelRow, 'trophy');
			labelRow.createSpan({ text: ' Lichess Rapid Rating' });

			const ratingRow = statBody.createDiv({ cls: 'gymnast-rapid-rating-row' });
			const ratingDisplay = latest.rating_rapid ? latest.rating_rapid.toString() : 'Unrated';
			ratingRow.createDiv({ cls: 'gymnast-rapid-rating-num', text: ratingDisplay });

			if (latest.prog_rapid !== null && latest.prog_rapid !== undefined) {
				const isPos = latest.prog_rapid > 0;
				const isNeg = latest.prog_rapid < 0;
				const sign = isPos ? '+' : '';
				const trendClass = isPos ? 'trend-up' : isNeg ? 'trend-down' : 'trend-neutral';
				const trendIcon = isPos ? 'trending-up' : isNeg ? 'trending-down' : 'minus';

				const trendBadge = ratingRow.createDiv({ cls: `gymnast-rapid-trend-badge ${trendClass}` });
				setIcon(trendBadge, trendIcon);
				trendBadge.createSpan({ text: `${sign}${latest.prog_rapid}` });
			}

			// Footer meta info
			const cardFooter = card.createDiv({ cls: 'gymnast-rapid-footer' });
			if (latest.games_rapid !== null && latest.games_rapid !== undefined) {
				cardFooter.createSpan({ text: `Total Games: ${latest.games_rapid}` });
				if (latest.prov_rapid) {
					cardFooter.createSpan({ cls: 'gymnast-prov-tag', text: 'Provisional' });
				}
			}

			const historySection = row.createDiv({ cls: 'history-section' });
			const historyHeader = historySection.createDiv({ cls: 'history-header' });
			historyHeader.createEl('h3', { text: 'Rapid Rating History' });

			const historyChartContainer = historySection.createDiv({ cls: 'history-chart-container' });
			renderHistoryChart(historyChartContainer, [{
				name: 'Rapid Rating',
				color: CATEGORICAL_PALETTE[0],
				points: ratingHistoryRows.map(r => ({ date: r.snapshot_date, value: r.rating_rapid }))
			}], {
				emptyMessage: 'Rating history will appear here after a day or two of snapshots — check back soon.'
			});
		};

		await renderFromViews();

		refreshBtn.addEventListener('click', async () => {
			refreshIconSpan.addClass('spin-anim');
			refreshBtn.disabled = true;
			try {
				const result = await supabaseInvoke<LichessRefreshResponse>(this.plugin, 'lichess-refresh', {});
				if (result.error) {
					new Notice(`⚠️ Refreshed with an error: ${result.error}`);
				} else {
					new Notice(`✅ Rating refreshed: ${result.rating ?? 'Unrated'}`);
				}
			} catch (err) {
				new Notice(`❌ Refresh failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
			}
			await renderFromViews();
			refreshIconSpan.removeClass('spin-anim');
			refreshBtn.disabled = false;
		});
	}

	private openSettings(): void {
		// @ts-ignore - Obsidian's internal setting object isn't in the public API surface
		this.app.setting.open();
		// @ts-ignore
		this.app.setting.openTabById(this.plugin.manifest.id);
	}

	private updateClock(): void {
		const now = new Date();
		if (this.clockEl) {
			this.clockEl.setText(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
		}
		if (this.dateEl) {
			const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
			this.dateEl.setText(now.toLocaleDateString(undefined, options).toUpperCase());
		}
	}

	private displayQuote(quote: ZenQuote): void {
		if (this.quoteEl && this.authorEl) {
			this.quoteEl.setText(`"${quote.q}"`);
			this.authorEl.setText(`— ${quote.a}`);
		}
	}

	private applyBackground(photo: UnsplashPhoto | null): void {
		if (this.bgLayerEl) {
			if (photo?.url) {
				this.bgLayerEl.style.backgroundImage = `url('${photo.url}')`;
			} else {
				this.bgLayerEl.style.backgroundImage = `linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)`;
			}
		}
	}

	private displayCredit(photo: UnsplashPhoto | null): void {
		if (this.creditEl) {
			this.creditEl.empty();
			if (photo?.authorName) {
				this.creditEl.setText('Photo by ');
				const authorLink = this.creditEl.createEl('a', {
					text: photo.authorName,
					href: photo.authorUrl || 'https://unsplash.com'
				});
				authorLink.setAttr('target', '_blank');
				this.creditEl.createSpan({ text: ' on Unsplash' });
			}
		}
	}

	private async loadQuote(mode: 'today' | 'random' = 'today'): Promise<void> {
		if (this.quoteEl) this.quoteEl.setText('Loading quote...');
		if (this.authorEl) this.authorEl.setText('');

		this.currentQuote = await fetchZenQuote(mode);
		this.displayQuote(this.currentQuote);
	}

	private async loadBackground(): Promise<void> {
		const accessKey = this.plugin.settings.unsplashAccessKey;
		this.currentPhoto = await fetchUnsplashPhoto(accessKey);
		this.applyBackground(this.currentPhoto);
		this.displayCredit(this.currentPhoto);
	}

	async onClose(): Promise<void> {
		this.clockEl = null;
		this.dateEl = null;
		this.quoteEl = null;
		this.authorEl = null;
		this.bgLayerEl = null;
		this.creditEl = null;
		this.contentContainerEl = null;
	}
}
