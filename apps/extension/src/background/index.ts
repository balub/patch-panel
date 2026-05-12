import { fetchDashdot } from '../adapters/dashdot';
import { fetchGlances } from '../adapters/glances';
import { pushSnapshot, DEFAULT_HISTORY } from '../shared/monitor-storage';
import { getState, onStateChange } from '../shared/storage';
import type { Item, MonitorGraphItem, MonitorValueItem } from '../shared/types';

// ── Existing listeners ──────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && typeof message === 'object' && message.type === 'OPEN_OPTIONS') {
    void chrome.runtime.openOptionsPage();
  }
});

// ── Monitor polling ──────────────────────────────────────────────────────────

type MonitorItem = MonitorValueItem | MonitorGraphItem;

function collectMonitors(items: Item[]): MonitorItem[] {
  const result: MonitorItem[] = [];
  for (const item of items) {
    if (item.type === 'monitor-value' || item.type === 'monitor-graph') {
      result.push(item);
    } else if (item.type === 'group') {
      result.push(...collectMonitors(item.items));
    }
  }
  return result;
}

// Per unique URL, keep the item with the shortest interval.
function deduplicateByUrl(monitors: MonitorItem[]): Map<string, MonitorItem> {
  const map = new Map<string, MonitorItem>();
  for (const m of monitors) {
    const existing = map.get(m.url);
    if (!existing || (m.interval ?? 10) < (existing.interval ?? 10)) {
      map.set(m.url, m);
    }
  }
  return map;
}

const timers = new Map<string, ReturnType<typeof setInterval>>();

function clearTimers(): void {
  for (const t of timers.values()) clearInterval(t);
  timers.clear();
}

async function poll(m: MonitorItem): Promise<void> {
  const history =
    m.type === 'monitor-graph' ? (m.history ?? DEFAULT_HISTORY) : DEFAULT_HISTORY;
  try {
    const snap =
      m.adapter === 'dashdot'
        ? await fetchDashdot(m.url)
        : await fetchGlances(m.url);
    await pushSnapshot(m.url, snap, history);
  } catch {
    // Fetch failed — content script will show stale state via timestamp check.
  }
}

function startPolling(monitors: Map<string, MonitorItem>): void {
  clearTimers();
  for (const [, item] of monitors) {
    void poll(item); // immediate first fetch
    const ms = (item.interval ?? 10) * 1000;
    timers.set(item.url, setInterval(() => void poll(item), ms));
  }
}

async function syncMonitors(): Promise<void> {
  const state = await getState();
  const all = collectMonitors(state.config?.items ?? []);
  startPolling(deduplicateByUrl(all));
}

// Start on SW boot and whenever the YAML config changes.
void syncMonitors();
onStateChange(() => void syncMonitors());

// chrome.alarms wakes the SW if it was killed — re-sync on each alarm tick.
chrome.alarms.create('monitor-keepalive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'monitor-keepalive') void syncMonitors();
});
