import type { MetricKey, MonitorGraphItem } from '../shared/types';
import type { MetricSnapshot } from '../adapters/types';
import {
  getReadings,
  isMonitorReadingsKey,
  urlFromKey,
  DEFAULT_HISTORY,
} from '../shared/monitor-storage';

const GRAPH_W = 40;
const GRAPH_H = 14;

const METRIC_COLORS: Record<string, string> = {
  cpu: 'var(--mg-cpu)',
  ram: 'var(--mg-ram)',
  gpu: 'var(--mg-gpu)',
  network: 'var(--mg-net)',
  disk: 'var(--mg-disk)',
};

function buildPoints(readings: MetricSnapshot[], key: MetricKey): string {
  const vals = readings.map((r) => {
    if (key === 'network') {
      return r.network ? r.network.up + r.network.down : 0;
    }
    return (r[key as keyof MetricSnapshot] as number | undefined) ?? 0;
  });

  const max = key === 'network' ? Math.max(...vals, 1) : 100;
  if (readings.length < 2) return '';

  return vals
    .map((v, i) => {
      const x = (i / (readings.length - 1)) * GRAPH_W;
      const y = GRAPH_H - (v / max) * GRAPH_H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function fmtVal(snap: MetricSnapshot, key: MetricKey): string {
  switch (key) {
    case 'cpu': return snap.cpu !== undefined ? `${snap.cpu}%` : '--';
    case 'ram': return snap.ram !== undefined ? `${snap.ram}%` : '--';
    case 'gpu': return snap.gpu !== undefined ? `${snap.gpu}%` : '--';
    case 'disk': return snap.disk !== undefined ? `${snap.disk}%` : '--';
    case 'network': return snap.network ? '~' : '--';
  }
}

function makeSvg(metric: MetricKey): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(GRAPH_W));
  svg.setAttribute('height', String(GRAPH_H));
  svg.setAttribute('viewBox', `0 0 ${GRAPH_W} ${GRAPH_H}`);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', METRIC_COLORS[metric] ?? 'currentColor');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('opacity', '0.9');
  svg.appendChild(line);

  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('r', '1.5');
  dot.setAttribute('fill', METRIC_COLORS[metric] ?? 'currentColor');
  svg.appendChild(dot);

  return svg;
}

function updateSvg(svg: SVGSVGElement, readings: MetricSnapshot[], metric: MetricKey): void {
  const points = buildPoints(readings, metric);
  const line = svg.querySelector('polyline');
  const dot = svg.querySelector('circle');
  if (line) line.setAttribute('points', points);
  if (dot && readings.length > 0) {
    const last = readings[readings.length - 1]!;
    const vals = readings.map((r) => (r[metric as keyof MetricSnapshot] as number | undefined) ?? 0);
    const max = metric === 'network' ? Math.max(...vals, 1) : 100;
    const lastVal = (last[metric as keyof MetricSnapshot] as number | undefined) ?? 0;
    const y = GRAPH_H - (lastVal / max) * GRAPH_H;
    dot.setAttribute('cx', String(GRAPH_W));
    dot.setAttribute('cy', y.toFixed(1));
  }
}

interface GraphCell {
  svg: SVGSVGElement;
  valEl: HTMLElement;
  metric: MetricKey;
}

function applyReadings(cells: GraphCell[], readings: MetricSnapshot[]): void {
  const latest = readings[readings.length - 1];
  for (const cell of cells) {
    updateSvg(cell.svg, readings, cell.metric);
    if (latest) cell.valEl.textContent = fmtVal(latest, cell.metric);
  }
}

export function renderMonitorGraph(
  item: MonitorGraphItem,
  context: 'bar' | 'dropdown' = 'bar',
): HTMLElement {
  const metrics = item.metrics ?? ['cpu', 'ram'];
  const interval = item.interval ?? 10;
  const history = item.history ?? DEFAULT_HISTORY;

  const el = document.createElement('div');
  el.className = context === 'dropdown'
    ? 'item monitor-graph monitor-graph-compact'
    : 'item monitor-graph';
  el.dataset.monitorUrl = item.url;
  el.dataset.interval = String(interval);
  el.title = item.name;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'mg-name';
  nameSpan.textContent = item.name;
  el.appendChild(nameSpan);

  const graphsEl = document.createElement('span');
  graphsEl.className = 'mg-graphs';

  const cells: GraphCell[] = [];

  for (const metric of metrics) {
    const cell = document.createElement('span');
    cell.className = 'mg-cell';

    const svg = makeSvg(metric);
    const valEl = document.createElement('span');
    valEl.className = `mg-val mg-${metric}`;
    valEl.textContent = '--';

    cell.appendChild(svg);
    cell.appendChild(valEl);
    graphsEl.appendChild(cell);
    cells.push({ svg, valEl, metric });
  }

  el.appendChild(graphsEl);

  void getReadings(item.url).then((readings) => applyReadings(cells, readings));

  (el as any).__mgCells = cells;
  (el as any).__mgHistory = history;

  return el;
}

export function handleMonitorReadingsChange(
  key: string,
  readings: MetricSnapshot[],
  shadow: ShadowRoot,
): void {
  if (!isMonitorReadingsKey(key)) return;
  const url = urlFromKey(key);
  shadow
    .querySelectorAll<HTMLElement>(`.monitor-graph[data-monitor-url="${CSS.escape(url)}"]`)
    .forEach((el) => {
      const cells = (el as any).__mgCells as GraphCell[] | undefined;
      if (cells) applyReadings(cells, readings);
    });
}
