import type { MetricKey, MonitorValueItem } from '../shared/types';
import type { MetricSnapshot } from '../adapters/types';
import { getLatest, isMonitorLatestKey, urlFromKey } from '../shared/monitor-storage';

const STALE_MULTIPLIER = 3;

function formatMetric(snap: MetricSnapshot, key: MetricKey): string {
  switch (key) {
    case 'cpu': return snap.cpu !== undefined ? `${snap.cpu}%` : '--';
    case 'ram': return snap.ram !== undefined ? `${snap.ram}%` : '--';
    case 'gpu': return snap.gpu !== undefined ? `${snap.gpu}%` : '--';
    case 'disk': return snap.disk !== undefined ? `${snap.disk}%` : '--';
    case 'network':
      if (!snap.network) return '--';
      return `↑${fmtBytes(snap.network.up)} ↓${fmtBytes(snap.network.down)}`;
  }
}

function fmtBytes(b: number): string {
  if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(1)}M`;
  if (b >= 1_000) return `${(b / 1_000).toFixed(0)}K`;
  return `${b}B`;
}

function isStale(snap: MetricSnapshot, interval: number): boolean {
  return Date.now() - snap.ts > interval * STALE_MULTIPLIER * 1000;
}

function applySnapshot(
  el: HTMLElement,
  snap: MetricSnapshot,
  metrics: MetricKey[],
  interval: number,
): void {
  const stale = isStale(snap, interval);
  el.classList.toggle('monitor-stale', stale);

  for (const key of metrics) {
    const span = el.querySelector<HTMLElement>(`[data-metric="${key}"]`);
    if (span) span.textContent = (stale ? '⚠ ' : '') + formatMetric(snap, key);
  }
}

export function renderMonitorValue(
  item: MonitorValueItem,
  context: 'bar' | 'dropdown' = 'bar',
): HTMLElement {
  const metrics = item.metrics ?? ['cpu', 'ram'];
  const interval = item.interval ?? 10;

  const el = document.createElement('div');
  el.className = context === 'dropdown' ? 'item monitor-value dropdown-item' : 'item monitor-value';
  el.dataset.monitorUrl = item.url;
  el.dataset.interval = String(interval);
  el.title = item.name;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'mv-name';
  nameSpan.textContent = item.name;
  el.appendChild(nameSpan);

  const metricsEl = document.createElement('span');
  metricsEl.className = 'mv-metrics';

  for (let i = 0; i < metrics.length; i++) {
    const key = metrics[i]!;
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'mv-sep';
      sep.textContent = '·';
      metricsEl.appendChild(sep);
    }
    const span = document.createElement('span');
    span.className = `mv-val mv-${key}`;
    span.dataset.metric = key;
    span.textContent = '--';
    metricsEl.appendChild(span);
  }

  el.appendChild(metricsEl);

  void getLatest(item.url).then((snap) => {
    if (snap) applySnapshot(el, snap, metrics, interval);
  });

  return el;
}

export function handleMonitorLatestChange(
  key: string,
  snap: MetricSnapshot,
  shadow: ShadowRoot,
): void {
  if (!isMonitorLatestKey(key)) return;
  const url = urlFromKey(key);
  shadow
    .querySelectorAll<HTMLElement>(`[data-monitor-url="${CSS.escape(url)}"]`)
    .forEach((el) => {
      const metrics = [...el.querySelectorAll<HTMLElement>('[data-metric]')].map(
        (s) => s.dataset.metric as MetricKey,
      );
      const interval = parseInt(el.dataset.interval ?? '10', 10);
      applySnapshot(el, snap, metrics, interval);
    });
}
