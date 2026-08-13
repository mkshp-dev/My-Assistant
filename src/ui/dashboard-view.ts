import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type MyPlugin from '../../main';
import { ZenQuote, UnsplashPhoto } from '../types';
import { fetchZenQuote } from '../utils/zenquotes';
import { fetchUnsplashPhoto } from '../utils/unsplash';
import { fetchGitHubRepoDetails, GitHubRepoDetails, fetchGitHubRepoEvents, GitHubRepoEvent } from '../utils/github';

export const DASHBOARD_VIEW_TYPE = 'my-assistant-dashboard';

export type DashboardTab = 'central' | 'obsidian-guru';

export class DashboardView extends ItemView {
	plugin: MyPlugin;
	private activeTab: DashboardTab = 'central';

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

		// Persona Switcher Bar
		const navBar = mainWrapper.createDiv({ cls: 'dashboard-nav-bar' });
		
		const centralBtn = navBar.createEl('button', {
			cls: `dashboard-nav-tab ${this.activeTab === 'central' ? 'is-active' : ''}`,
			text: 'Central Dashboard'
		});
		centralBtn.addEventListener('click', () => {
			if (this.activeTab !== 'central') {
				this.activeTab = 'central';
				this.renderDashboard();
			}
		});

		const guruBtn = navBar.createEl('button', {
			cls: `dashboard-nav-tab ${this.activeTab === 'obsidian-guru' ? 'is-active' : ''}`,
			text: 'Obsidian Guru'
		});
		guruBtn.addEventListener('click', () => {
			if (this.activeTab !== 'obsidian-guru') {
				this.activeTab = 'obsidian-guru';
				this.renderDashboard();
			}
		});

		// Dynamic content container
		this.contentContainerEl = mainWrapper.createDiv({ cls: 'dashboard-tab-content' });

		if (this.activeTab === 'central') {
			this.renderCentralContent(this.contentContainerEl, mainWrapper);
		} else {
			this.renderObsidianGuruContent(this.contentContainerEl, mainWrapper);
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
		settingsBtn.addEventListener('click', () => {
			// @ts-ignore
			this.app.setting.open();
			// @ts-ignore
			this.app.setting.openTabById(this.plugin.manifest.id);
		});

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

		const previousRefreshTime = this.plugin.settings.lastGuruRefreshTime;
		const currentRefreshIso = new Date().toISOString();

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

		// Refresh Button
		const refreshBtn = headerActions.createEl('button', { cls: 'dashboard-btn guru-refresh-btn', title: 'Refresh statistics & notifications' });
		const refreshIconSpan = refreshBtn.createSpan({ cls: 'guru-refresh-icon' });
		setIcon(refreshIconSpan, 'refresh-cw');
		refreshBtn.createSpan({ text: ' Refresh' });
		
		refreshBtn.addEventListener('click', async () => {
			refreshIconSpan.addClass('spin-anim');
			refreshBtn.disabled = true;
			await this.renderObsidianGuruContent(contentWrapper, mainWrapper);
		});

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

		const repos = this.plugin.settings.obsidianGuruRepos || [];

		if (repos.length === 0) {
			const emptyState = contentWrapper.createDiv({ cls: 'guru-empty-state' });
			emptyState.createEl('p', { text: 'No repositories configured for tracking.' });
			const settingsBtn = emptyState.createEl('button', { cls: 'dashboard-btn', text: 'Configure Repositories in Settings' });
			settingsBtn.addEventListener('click', () => {
				// @ts-ignore
				this.app.setting.open();
				// @ts-ignore
				this.app.setting.openTabById(this.plugin.manifest.id);
			});
			return;
		}

		// Repos Grid Container
		const grid = contentWrapper.createDiv({ cls: 'guru-repo-grid' });
		grid.createDiv({ cls: 'guru-loading-msg', text: 'Fetching GitHub statistics...' });

		// Fetch repos & events in parallel
		const [results, eventsNested] = await Promise.all([
			Promise.all(repos.map(r => fetchGitHubRepoDetails(r, this.plugin.settings.githubToken))),
			Promise.all(repos.map(r => fetchGitHubRepoEvents(r, previousRefreshTime, this.plugin.settings.githubToken)))
		]);

		// Save current refresh time to settings
		this.plugin.settings.lastGuruRefreshTime = currentRefreshIso;
		await this.plugin.saveSettings();

		// Flatten & sort events descending
		const allEvents: GitHubRepoEvent[] = eventsNested.flat().sort(
			(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
		);

		// Render Notifications inside Dropdown Popover
		notifDropdown.empty();
		const dropdownHeader = notifDropdown.createDiv({ cls: 'guru-dropdown-header' });
		dropdownHeader.createEl('h4', { text: 'Notifications' });
		
		const timeDisplayStr = new Date(currentRefreshIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		dropdownHeader.createSpan({ cls: 'guru-dropdown-sub', text: `Refreshed: ${timeDisplayStr}` });

		const dropdownList = notifDropdown.createDiv({ cls: 'guru-dropdown-list' });

		if (allEvents.length > 0) {
			notifBadgeDot.style.display = 'inline-block';

			allEvents.slice(0, 10).forEach(ev => {
				const item = dropdownList.createDiv({ cls: 'guru-notif-item' });
				
				const top = item.createDiv({ cls: 'guru-notif-top' });
				const titleLink = top.createEl('a', { text: `${ev.repoName}: ${ev.title}`, href: ev.url || '#' });
				titleLink.setAttr('target', '_blank');
				
				top.createSpan({ cls: 'guru-notif-time', text: new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
				
				if (ev.detail) {
					item.createDiv({ cls: 'guru-notif-detail', text: ev.detail });
				}
			});
		} else {
			notifBadgeDot.style.display = 'none';
			dropdownList.createDiv({ cls: 'guru-notif-empty', text: '✨ No new activity since last refresh' });
		}

		// Render repo cards
		grid.empty();
		results.forEach(repo => {
			const card = grid.createDiv({ cls: 'guru-repo-card' });
			
			const cardHeader = card.createDiv({ cls: 'guru-card-header' });
			const repoLink = cardHeader.createEl('a', { text: repo.full_name, href: repo.html_url });
			repoLink.setAttr('target', '_blank');

			if (repo.error) {
				card.createDiv({ cls: 'guru-repo-error', text: `Error: ${repo.error}` });
				return;
			}

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

			// Calculate release recency & release period threshold
			const releasePeriods = this.plugin.settings.repoReleasePeriods || {};
			const repoKey = repo.full_name.toLowerCase();
			const targetPeriod = releasePeriods[repoKey];

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

			// Add small red dot if release period target exists and is overdue (or never released)
			if (targetPeriod !== undefined) {
				const isOverdue = daysAgo === null || daysAgo > targetPeriod;
				if (isOverdue) {
					const warningDot = releaseTextEl.createSpan({ cls: 'guru-overdue-dot' });
					warningDot.setAttr('title', `Overdue! Target release period is ${targetPeriod} days.`);
				}
			}
		});
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
