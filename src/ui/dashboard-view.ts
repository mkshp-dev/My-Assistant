import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type MyPlugin from '../../main';
import { ZenQuote, UnsplashPhoto } from '../types';
import { fetchZenQuote } from '../utils/zenquotes';
import { fetchUnsplashPhoto } from '../utils/unsplash';

export const DASHBOARD_VIEW_TYPE = 'my-assistant-dashboard';

export class DashboardView extends ItemView {
	plugin: MyPlugin;
	private currentQuote: ZenQuote | null = null;
	private currentPhoto: UnsplashPhoto | null = null;
	private clockEl: HTMLElement | null = null;
	private dateEl: HTMLElement | null = null;
	private quoteEl: HTMLElement | null = null;
	private authorEl: HTMLElement | null = null;
	private bgLayerEl: HTMLElement | null = null;
	private creditEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Central Dashboard';
	}

	getIcon(): string {
		return 'layout-dashboard';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		const root = container.createDiv({ cls: 'my-assistant-dashboard' });

		// Bright background layer & subtle light overlay
		this.bgLayerEl = root.createDiv({ cls: 'dashboard-bg-layer' });
		root.createDiv({ cls: 'dashboard-overlay' });

		// Main content wrapper
		const contentWrapper = root.createDiv({ cls: 'dashboard-content-container' });

		// Top Section: Minimalized Date & Time Badge
		const headerSection = contentWrapper.createDiv({ cls: 'dashboard-header-section' });
		const dateBadge = headerSection.createDiv({ cls: 'dashboard-date-badge' });
		this.dateEl = dateBadge.createSpan({ cls: 'dashboard-date-text' });
		dateBadge.createSpan({ cls: 'dashboard-date-divider', text: ' • ' });
		this.clockEl = dateBadge.createSpan({ cls: 'dashboard-clock-text' });
		this.updateClock();

		// Middle Section: Free-floating Quote (No card block)
		const quoteWrapper = contentWrapper.createDiv({ cls: 'dashboard-quote-wrapper' });
		this.quoteEl = quoteWrapper.createDiv({ cls: 'dashboard-quote-text', text: 'Loading quote...' });
		this.authorEl = quoteWrapper.createDiv({ cls: 'dashboard-quote-author', text: '' });

		// Bottom Container for Photo Credit & Toolbar
		const bottomSection = contentWrapper.createDiv({ cls: 'dashboard-bottom-section' });

		// Unsplash photo attribution tag
		this.creditEl = bottomSection.createDiv({ cls: 'dashboard-photo-credit' });

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

		// Live clock update every second
		this.registerInterval(window.setInterval(() => this.updateClock(), 1000));

		// Load initial data
		await Promise.all([
			this.loadQuote('today'),
			this.loadBackground()
		]);
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

	private async loadQuote(mode: 'today' | 'random' = 'today'): Promise<void> {
		if (this.quoteEl) this.quoteEl.setText('Loading quote...');
		if (this.authorEl) this.authorEl.setText('');

		this.currentQuote = await fetchZenQuote(mode);
		if (this.quoteEl && this.authorEl) {
			this.quoteEl.setText(`"${this.currentQuote.q}"`);
			this.authorEl.setText(`— ${this.currentQuote.a}`);
		}
	}

	private async loadBackground(): Promise<void> {
		const accessKey = this.plugin.settings.unsplashAccessKey;
		this.currentPhoto = await fetchUnsplashPhoto(accessKey);

		if (this.bgLayerEl) {
			if (this.currentPhoto?.url) {
				this.bgLayerEl.style.backgroundImage = `url('${this.currentPhoto.url}')`;
			} else {
				// Vibrant, bright fallback gradient backdrop
				this.bgLayerEl.style.backgroundImage = `linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)`;
			}
		}

		if (this.creditEl) {
			this.creditEl.empty();
			if (this.currentPhoto?.authorName) {
				this.creditEl.setText('Photo by ');
				const authorLink = this.creditEl.createEl('a', {
					text: this.currentPhoto.authorName,
					href: this.currentPhoto.authorUrl || 'https://unsplash.com'
				});
				authorLink.setAttr('target', '_blank');
				this.creditEl.createSpan({ text: ' on Unsplash' });
			}
		}
	}

	async onClose(): Promise<void> {
		// Clean up references
		this.clockEl = null;
		this.dateEl = null;
		this.quoteEl = null;
		this.authorEl = null;
		this.bgLayerEl = null;
		this.creditEl = null;
	}
}
