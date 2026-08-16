import { HistorySnapshot } from '../types';

/**
 * Fixed-order categorical palette (dark-surface validated). Assigned by each
 * entity's stable position, never by rank, so a color always means the same
 * repo/series regardless of which filters are active.
 */
export const CATEGORICAL_PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export interface HistoryChartSeries {
	name: string;
	color: string;
	points: HistorySnapshot[];
}

export interface RenderHistoryChartOptions {
	height?: number;
	valueLabel?: (value: number) => string;
	emptyMessage?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_WIDTH = 640;
const PAD_LEFT = 46;
const PAD_RIGHT = 14;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

let chartInstanceCounter = 0;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
	const el = document.createElementNS(SVG_NS, tag);
	for (const key of Object.keys(attrs)) {
		el.setAttribute(key, String(attrs[key]));
	}
	return el;
}

function formatDateLabel(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00`);
	if (isNaN(d.getTime())) return dateStr;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface Point {
	x: number;
	y: number;
}

/**
 * Catmull-Rom-to-Bezier smoothing — a standard technique for turning a
 * polyline into a smooth curve through the same points (endpoints clamped by
 * duplicating the first/last point). Divisor of 6 gives a gentle, minimally
 * overshooting curve, appropriate for count data that should read as a trend
 * rather than a scientific plot.
 */
function smoothPathD(points: Point[]): string {
	if (points.length < 2) return '';
	if (points.length === 2) {
		return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)} L${points[1].x.toFixed(2)},${points[1].y.toFixed(2)}`;
	}

	let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i === 0 ? 0 : i - 1];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

		const cp1x = p1.x + (p2.x - p0.x) / 6;
		const cp1y = p1.y + (p2.y - p0.y) / 6;
		const cp2x = p2.x - (p3.x - p1.x) / 6;
		const cp2y = p2.y - (p3.y - p1.y) / 6;

		d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
	}
	return d;
}

/**
 * Renders a lightweight inline-SVG line chart into `container`. No external
 * charting library is used anywhere in this plugin, so this stays hand-rolled
 * and dependency-free.
 */
export function renderHistoryChart(container: HTMLElement, series: HistoryChartSeries[], options: RenderHistoryChartOptions = {}): void {
	container.empty();

	const usable = series.filter(s => s.points.length > 0);
	const hasEnoughHistory = usable.some(s => s.points.length >= 2);

	if (usable.length === 0 || !hasEnoughHistory) {
		const empty = container.createDiv({ cls: 'history-empty' });
		empty.setText(options.emptyMessage || 'Not enough history yet — check back after your next refresh to see a trend.');
		return;
	}

	const height = options.height ?? 200;
	const valueLabel = options.valueLabel ?? ((v: number) => Math.round(v).toString());

	// Legend (only meaningful once there's more than one series to tell apart)
	if (usable.length > 1) {
		const legend = container.createDiv({ cls: 'history-legend' });
		usable.forEach(s => {
			const item = legend.createDiv({ cls: 'history-legend-item' });
			const dot = item.createSpan({ cls: 'history-legend-dot' });
			dot.style.backgroundColor = s.color;
			item.createSpan({ cls: 'history-legend-label', text: s.name });
		});
	}

	const allDates = Array.from(new Set(usable.flatMap(s => s.points.map(p => p.date)))).sort();
	const allValues = usable.flatMap(s => s.points.map(p => p.value));
	let minV = Math.min(...allValues);
	let maxV = Math.max(...allValues);
	if (minV === maxV) {
		minV -= 1;
		maxV += 1;
	}
	const vPad = (maxV - minV) * 0.12;
	minV -= vPad;
	maxV += vPad;

	const plotW = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
	const plotH = height - PAD_TOP - PAD_BOTTOM;

	const xForDate = (date: string): number => {
		if (allDates.length === 1) return PAD_LEFT + plotW / 2;
		const idx = allDates.indexOf(date);
		return PAD_LEFT + (idx / (allDates.length - 1)) * plotW;
	};
	const yForValue = (value: number): number => PAD_TOP + (1 - (value - minV) / (maxV - minV)) * plotH;

	const chartWrap = container.createDiv({ cls: 'history-chart-wrap' });
	const svg = svgEl('svg', { viewBox: `0 0 ${CHART_WIDTH} ${height}`, class: 'history-svg' });
	const instanceId = ++chartInstanceCounter;

	// Recessive gridlines + axis labels (min/max only, to stay minimal)
	const gridTop = svgEl('line', { x1: PAD_LEFT, y1: PAD_TOP, x2: CHART_WIDTH - PAD_RIGHT, y2: PAD_TOP, class: 'history-grid-line' });
	const gridBottom = svgEl('line', { x1: PAD_LEFT, y1: PAD_TOP + plotH, x2: CHART_WIDTH - PAD_RIGHT, y2: PAD_TOP + plotH, class: 'history-grid-line' });
	svg.appendChild(gridTop);
	svg.appendChild(gridBottom);

	const maxLabel = svgEl('text', { x: PAD_LEFT - 8, y: PAD_TOP + 4, class: 'history-axis-label', 'text-anchor': 'end' });
	maxLabel.textContent = valueLabel(maxV - vPad);
	const minLabel = svgEl('text', { x: PAD_LEFT - 8, y: PAD_TOP + plotH + 4, class: 'history-axis-label', 'text-anchor': 'end' });
	minLabel.textContent = valueLabel(minV + vPad);
	svg.appendChild(maxLabel);
	svg.appendChild(minLabel);

	const firstDateLabel = svgEl('text', { x: PAD_LEFT, y: height - 8, class: 'history-axis-label', 'text-anchor': 'start' });
	firstDateLabel.textContent = formatDateLabel(allDates[0]);
	const lastDateLabel = svgEl('text', { x: CHART_WIDTH - PAD_RIGHT, y: height - 8, class: 'history-axis-label', 'text-anchor': 'end' });
	lastDateLabel.textContent = formatDateLabel(allDates[allDates.length - 1]);
	svg.appendChild(firstDateLabel);
	svg.appendChild(lastDateLabel);

	// Series lines + points — smoothed via Catmull-Rom-to-Bezier. A soft
	// gradient area fill is added under a single series (skipped for
	// multi-series charts, where overlapping fills would just look muddy).
	const defs = svgEl('defs');
	svg.appendChild(defs);

	usable.forEach((s, seriesIndex) => {
		const sorted = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
		const pts: Point[] = sorted.map(p => ({ x: xForDate(p.date), y: yForValue(p.value) }));
		const d = smoothPathD(pts);

		if (sorted.length >= 2) {
			if (usable.length === 1) {
				const gradientId = `history-area-${instanceId}-${seriesIndex}`;
				const gradient = svgEl('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' });
				const stopTop = svgEl('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': '0.28' });
				const stopBottom = svgEl('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': '0' });
				gradient.appendChild(stopTop);
				gradient.appendChild(stopBottom);
				defs.appendChild(gradient);

				const baselineY = PAD_TOP + plotH;
				const areaD = `${d} L${pts[pts.length - 1].x.toFixed(2)},${baselineY} L${pts[0].x.toFixed(2)},${baselineY} Z`;
				const area = svgEl('path', { d: areaD, class: 'history-area', fill: `url(#${gradientId})` });
				svg.appendChild(area);
			}

			const path = svgEl('path', { d, class: 'history-line', stroke: s.color, fill: 'none' });
			svg.appendChild(path);
		}

		sorted.forEach((p, i) => {
			const isLast = i === sorted.length - 1;
			const dot = svgEl('circle', {
				cx: xForDate(p.date).toFixed(2),
				cy: yForValue(p.value).toFixed(2),
				r: isLast ? 4 : 2.5,
				class: 'history-point',
				fill: s.color
			});
			svg.appendChild(dot);
		});

		// Endpoint value label — skip when many series are stacked to avoid clutter
		if (usable.length <= 4) {
			const last = sorted[sorted.length - 1];
			const label = svgEl('text', {
				x: Math.min(xForDate(last.date) + 6, CHART_WIDTH - PAD_RIGHT),
				y: yForValue(last.value) - 8,
				class: 'history-point-label',
				fill: s.color,
				'text-anchor': xForDate(last.date) > CHART_WIDTH - PAD_RIGHT - 40 ? 'end' : 'start'
			});
			label.textContent = valueLabel(last.value);
			svg.appendChild(label);
		}
	});

	// Hover crosshair + tooltip
	const crosshair = svgEl('line', { x1: 0, y1: PAD_TOP, x2: 0, y2: PAD_TOP + plotH, class: 'history-crosshair' });
	crosshair.style.opacity = '0';
	svg.appendChild(crosshair);

	const overlay = svgEl('rect', { x: PAD_LEFT, y: 0, width: plotW, height, class: 'history-hover-overlay', fill: 'transparent' });
	svg.appendChild(overlay);

	chartWrap.appendChild(svg);

	const tooltip = chartWrap.createDiv({ cls: 'history-tooltip' });
	tooltip.style.opacity = '0';

	const handleMove = (clientX: number) => {
		const rect = chartWrap.getBoundingClientRect();
		const scale = rect.width / CHART_WIDTH;
		const relX = (clientX - rect.left) / scale;
		const fraction = Math.min(1, Math.max(0, (relX - PAD_LEFT) / plotW));
		const idx = allDates.length > 1 ? Math.round(fraction * (allDates.length - 1)) : 0;
		const date = allDates[idx];
		if (!date) return;

		crosshair.setAttribute('x1', xForDate(date).toFixed(2));
		crosshair.setAttribute('x2', xForDate(date).toFixed(2));
		crosshair.style.opacity = '1';

		tooltip.empty();
		tooltip.createDiv({ cls: 'history-tooltip-date', text: formatDateLabel(date) });
		usable.forEach(s => {
			const point = s.points.find(p => p.date === date);
			if (!point) return;
			const row = tooltip.createDiv({ cls: 'history-tooltip-row' });
			const dot = row.createSpan({ cls: 'history-tooltip-dot' });
			dot.style.backgroundColor = s.color;
			row.createSpan({ text: usable.length > 1 ? `${s.name}: ${valueLabel(point.value)}` : valueLabel(point.value) });
		});
		tooltip.style.opacity = '1';

		const tooltipX = xForDate(date) * scale;
		const flip = tooltipX > rect.width - 120;
		tooltip.style.left = flip ? 'auto' : `${tooltipX + 10}px`;
		tooltip.style.right = flip ? `${rect.width - tooltipX + 10}px` : 'auto';
	};

	overlay.addEventListener('mousemove', (e: MouseEvent) => handleMove(e.clientX));
	overlay.addEventListener('mouseleave', () => {
		crosshair.style.opacity = '0';
		tooltip.style.opacity = '0';
	});
}
