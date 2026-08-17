/**
 * Reusable dashboard widgets following the glass-card visual language from styles.css.
 */

export interface StatTileOptions {
	label: string;
	value: string | number;
	icon?: string;
	sublabel?: string;
}

export interface ProgressBarOptions {
	label: string;
	pct: number; // 0-100
	sublabel?: string;
}

/**
 * Render a stat tile: label + large value, optional icon + sublabel.
 * Uses .stat-tile class (defined in styles.css).
 */
export function renderStatTile(container: HTMLElement, opts: StatTileOptions): void {
	const tile = container.createDiv({ cls: 'stat-tile' });

	const header = tile.createDiv({ cls: 'stat-tile-header' });
	if (opts.icon) {
		const icon = header.createSpan({ cls: 'stat-tile-icon' });
		icon.textContent = opts.icon;
	}
	header.createSpan({ cls: 'stat-tile-label', text: opts.label });

	const value = tile.createDiv({ cls: 'stat-tile-value', text: String(opts.value) });

	if (opts.sublabel) {
		tile.createDiv({ cls: 'stat-tile-sublabel', text: opts.sublabel });
	}
}

/**
 * Render a progress bar: label + bar + percentage, optional sublabel.
 * Uses .progress-bar class (defined in styles.css).
 */
export function renderProgressBar(container: HTMLElement, opts: ProgressBarOptions): void {
	const bar = container.createDiv({ cls: 'progress-bar' });

	bar.createDiv({ cls: 'progress-bar-label', text: opts.label });

	const barContainer = bar.createDiv({ cls: 'progress-bar-container' });
	const fill = barContainer.createDiv({ cls: 'progress-bar-fill' });
	fill.style.width = `${Math.max(0, Math.min(100, opts.pct))}%`;

	const pctLabel = bar.createDiv({ cls: 'progress-bar-pct', text: `${opts.pct}%` });

	if (opts.sublabel) {
		bar.createDiv({ cls: 'progress-bar-sublabel', text: opts.sublabel });
	}
}
