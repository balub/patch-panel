# Monitor Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `monitor-value` and `monitor-graph` item types to the patch-panel Chrome extension that display live Dash./Glances metrics in the bar.

**Architecture:** The background service worker polls Dash./Glances REST APIs at a configurable interval and writes readings into `chrome.storage.local` ring buffers. Content scripts listen to storage changes and update monitor item DOM elements in-place, without re-rendering the entire bar.

**Tech Stack:** TypeScript, Chrome MV3 APIs (`chrome.storage.local`, `chrome.alarms`), SVG for sparklines, Dash. REST API (`/load/cpu` etc.), Glances REST API (`/api/4/all`), existing Vite + CRX build.

---

## File Map

**New files:**
- `apps/extension/src/adapters/types.ts` — `MetricSnapshot` type shared by all adapters
- `apps/extension/src/adapters/dashdot.ts` — Dash. HTTP client
- `apps/extension/src/adapters/glances.ts` — Glances HTTP client
- `apps/extension/src/shared/monitor-storage.ts` — ring buffer read/write for `chrome.storage.local`
- `apps/extension/src/content/monitor-value.ts` — renders a `monitor-value` bar item
- `apps/extension/src/content/monitor-graph.ts` — renders a `monitor-graph` bar item with sparklines

**Modified files:**
- `apps/extension/src/shared/types.ts` — add `MonitorValueItem`, `MonitorGraphItem`, `MetricKey`; widen `GroupItem.items` and `Item`
- `apps/extension/src/shared/storage.ts` — fix `onStateChange` to ignore monitor storage keys (prevent full re-renders on every poll)
- `apps/extension/src/shared/schema.ts` — validate new item types (top-level and inside groups)
- `apps/extension/src/background/index.ts` — polling loop that reads config and drives adapters
- `apps/extension/src/content/bar.ts` — dispatch to new renderers; manage live-update registry
- `apps/extension/src/content/group.ts` — dispatch child items by type instead of casting all as `ServiceItem`
- `apps/extension/src/content/bar.css` — styles for `.monitor-value` and `.monitor-graph` items
- `apps/extension/manifest.json` — add `host_permissions` for background fetch to local IPs
- `apps/extension/examples/homelab.yaml` — add monitor examples

---

## Task 1: Extend the type system

**Files:**
- Modify: `apps/extension/src/shared/types.ts`

- [ ] **Step 1: Add new types to `src/shared/types.ts`**

Replace the entire file with:

```typescript
export type DisplayMode = 'icon_only' | 'icon_text' | 'text_only';

export type BarPosition = 'top' | 'left' | 'right';

export interface ServiceItem {
  type: 'service';
  name: string;
  url: string;
  icon?: string;
}

export type MetricKey = 'cpu' | 'ram' | 'gpu' | 'network' | 'disk';

export interface MonitorValueItem {
  type: 'monitor-value';
  name: string;
  adapter: 'dashdot' | 'glances';
  url: string;
  metrics?: MetricKey[];   // default: ['cpu', 'ram']
  interval?: number;       // seconds, default 10
}

export interface MonitorGraphItem {
  type: 'monitor-graph';
  name: string;
  adapter: 'dashdot' | 'glances';
  url: string;
  metrics?: MetricKey[];   // default: ['cpu', 'ram']
  interval?: number;       // seconds, default 10
  history?: number;        // readings to show in sparkline, default 20
}

export interface GroupItem {
  type: 'group';
  name: string;
  icon?: string;
  items: Item[];
}

export type Item = ServiceItem | GroupItem | MonitorValueItem | MonitorGraphItem;

export interface NormalizedConfig {
  title?: string;
  displayMode?: DisplayMode;
  items: Item[];
}

export interface StoredState {
  rawYaml?: string;
  config?: NormalizedConfig;
  displayMode?: DisplayMode;
  barPosition?: BarPosition;
  barHeight?: number;
  barWidth?: number;
  autoHide?: boolean;
  schemaVersion?: 1;
}

export const BAR_HEIGHT_DEFAULT = 30;
export const BAR_HEIGHT_MIN = 20;
export const BAR_HEIGHT_MAX = 60;

export const BAR_WIDTH_DEFAULT = 180;
export const BAR_WIDTH_MIN = 40;
export const BAR_WIDTH_MAX = 320;

export const BAR_POSITION_DEFAULT: BarPosition = 'top';

export function isVertical(p: BarPosition): boolean {
  return p === 'left' || p === 'right';
}

export type ValidationResult =
  | { ok: true; config: NormalizedConfig }
  | { ok: false; errors: string[] };
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes (only types changed, no logic yet).

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/shared/types.ts
git commit -m "feat: add MonitorValueItem and MonitorGraphItem types"
```

---

## Task 2: Fix `onStateChange` to ignore monitor storage keys

**Files:**
- Modify: `apps/extension/src/shared/storage.ts`

Without this fix, every poll write to `chrome.storage.local` would trigger a full bar re-render.

- [ ] **Step 1: Update `onStateChange` in `src/shared/storage.ts`**

Replace the entire file with:

```typescript
import type { StoredState } from './types';

const KEYS: (keyof StoredState)[] = [
  'rawYaml',
  'config',
  'displayMode',
  'barPosition',
  'barHeight',
  'barWidth',
  'autoHide',
  'schemaVersion',
];

const CONFIG_KEY_SET = new Set<string>(KEYS);

export async function getState(): Promise<StoredState> {
  const raw = await chrome.storage.local.get(KEYS as string[]);
  return raw as StoredState;
}

export async function setState(partial: Partial<StoredState>): Promise<void> {
  await chrome.storage.local.set(partial);
}

export function onStateChange(cb: (state: StoredState) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!Object.keys(changes).some((k) => CONFIG_KEY_SET.has(k))) return;
    void getState().then(cb);
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/shared/storage.ts
git commit -m "fix: onStateChange ignores monitor storage keys to prevent re-renders on poll"
```

---

## Task 3: Adapter types and Dash. client

**Files:**
- Create: `apps/extension/src/adapters/types.ts`
- Create: `apps/extension/src/adapters/dashdot.ts`

- [ ] **Step 1: Create `src/adapters/types.ts`**

```typescript
export interface MetricSnapshot {
  ts: number;
  cpu?: number;     // 0–100
  ram?: number;     // 0–100
  gpu?: number;     // 0–100
  network?: { up: number; down: number };  // bytes/s
  disk?: number;    // 0–100 (first filesystem)
}
```

- [ ] **Step 2: Create `src/adapters/dashdot.ts`**

Dash. exposes separate endpoints per metric. `/load/ram` gives bytes used; `/info` gives total RAM and storage sizes needed to compute percentages.

```typescript
import type { MetricSnapshot } from './types';

export async function fetchDashdot(baseUrl: string): Promise<MetricSnapshot> {
  const base = baseUrl.replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);

  try {
    const get = (path: string) =>
      fetch(`${base}${path}`, { signal: ctrl.signal });

    const [infoRes, cpuRes, ramRes, gpuRes, netRes, storageRes] =
      await Promise.all([
        get('/info'),
        get('/load/cpu'),
        get('/load/ram'),
        get('/load/gpu').catch(() => null),
        get('/load/network').catch(() => null),
        get('/load/storage').catch(() => null),
      ]);

    const snap: MetricSnapshot = { ts: Date.now() };

    const infoText = infoRes.ok ? await infoRes.text() : '';
    const info = infoText
      ? (JSON.parse(infoText) as {
          ram: { size: number };
          storage: Array<{ size: number }>;
        })
      : null;

    // CPU: array of { load, temp } per core → average
    const cpuText = cpuRes.ok ? await cpuRes.text() : '';
    if (cpuText) {
      const cores = JSON.parse(cpuText) as Array<{ load: number }>;
      if (cores.length > 0) {
        snap.cpu = Math.round(
          cores.reduce((s, c) => s + c.load, 0) / cores.length,
        );
      }
    }

    // RAM: { load: bytesUsed } — percentage needs info.ram.size
    const ramText = ramRes.ok ? await ramRes.text() : '';
    if (ramText && info) {
      const parsed = JSON.parse(ramText) as Record<string, unknown>;
      if (Object.keys(parsed).length > 0) {
        const { load } = parsed as { load: number };
        snap.ram = Math.round((load / info.ram.size) * 100);
      }
    }

    // GPU: { layout: [{ load?, memory? }] } → first GPU load
    if (gpuRes?.ok) {
      const gpuText = await gpuRes.text();
      if (gpuText) {
        const { layout } = JSON.parse(gpuText) as {
          layout: Array<{ load?: number }>;
        };
        if (layout[0]?.load !== undefined) {
          snap.gpu = Math.round(layout[0].load);
        }
      }
    }

    // Network: { up, down } bytes/s
    if (netRes?.ok) {
      const netText = await netRes.text();
      if (netText) {
        snap.network = JSON.parse(netText) as { up: number; down: number };
      }
    }

    // Storage: number[] of bytes used per filesystem → first entry as %
    if (storageRes?.ok && info?.storage?.[0]) {
      const storageText = await storageRes.text();
      if (storageText) {
        const loads = JSON.parse(storageText) as number[];
        const used = loads[0];
        if (used !== undefined && used !== -1) {
          snap.disk = Math.round((used / info.storage[0].size) * 100);
        }
      }
    }

    return snap;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/adapters/
git commit -m "feat: add MetricSnapshot type and Dash. adapter"
```

---

## Task 4: Glances adapter

**Files:**
- Create: `apps/extension/src/adapters/glances.ts`

Glances exposes everything in one call: `GET /api/4/all`.

- [ ] **Step 1: Create `src/adapters/glances.ts`**

```typescript
import type { MetricSnapshot } from './types';

interface GlancesAll {
  cpu: { total: number };
  mem: { total: number; used: number };
  gpu?: Array<{ proc?: number | null }>;
  network?: Array<{
    bytes_sent_rate_per_sec: number;
    bytes_recv_rate_per_sec: number;
  }>;
  fs?: Array<{ percent: number }>;
}

export async function fetchGlances(baseUrl: string): Promise<MetricSnapshot> {
  const base = baseUrl.replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);

  try {
    const res = await fetch(`${base}/api/4/all`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Glances ${res.status}`);

    const data = (await res.json()) as GlancesAll;
    const snap: MetricSnapshot = { ts: Date.now() };

    snap.cpu = Math.round(data.cpu.total);
    snap.ram = Math.round((data.mem.used / data.mem.total) * 100);

    const gpuProc = data.gpu?.[0]?.proc;
    if (gpuProc != null) snap.gpu = Math.round(gpuProc);

    if (data.network?.length) {
      snap.network = {
        up: data.network.reduce((s, n) => s + n.bytes_sent_rate_per_sec, 0),
        down: data.network.reduce((s, n) => s + n.bytes_recv_rate_per_sec, 0),
      };
    }

    if (data.fs?.[0]) snap.disk = Math.round(data.fs[0].percent);

    return snap;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/adapters/glances.ts
git commit -m "feat: add Glances adapter"
```

---

## Task 5: Monitor storage ring buffer

**Files:**
- Create: `apps/extension/src/shared/monitor-storage.ts`

- [ ] **Step 1: Create `src/shared/monitor-storage.ts`**

```typescript
import type { MetricSnapshot } from '../adapters/types';

const PREFIX = 'pp:monitor:';
export const DEFAULT_HISTORY = 20;

const latestKey = (url: string) => `${PREFIX}${url}:latest`;
const readingsKey = (url: string) => `${PREFIX}${url}:readings`;

export async function pushSnapshot(
  url: string,
  snap: MetricSnapshot,
  cap = DEFAULT_HISTORY,
): Promise<void> {
  const rKey = readingsKey(url);
  const lKey = latestKey(url);
  const stored = await chrome.storage.local.get(rKey);
  const existing = (stored[rKey] as MetricSnapshot[] | undefined) ?? [];
  const trimmed = [...existing, snap].slice(-cap);
  await chrome.storage.local.set({ [lKey]: snap, [rKey]: trimmed });
}

export async function getLatest(
  url: string,
): Promise<MetricSnapshot | undefined> {
  const result = await chrome.storage.local.get(latestKey(url));
  return result[latestKey(url)] as MetricSnapshot | undefined;
}

export async function getReadings(url: string): Promise<MetricSnapshot[]> {
  const result = await chrome.storage.local.get(readingsKey(url));
  return (result[readingsKey(url)] as MetricSnapshot[] | undefined) ?? [];
}

export function isMonitorLatestKey(key: string): boolean {
  return key.startsWith(PREFIX) && key.endsWith(':latest');
}

export function isMonitorReadingsKey(key: string): boolean {
  return key.startsWith(PREFIX) && key.endsWith(':readings');
}

export function urlFromKey(key: string): string {
  // "pp:monitor:<url>:latest" or "pp:monitor:<url>:readings"
  const inner = key.slice(PREFIX.length);
  return inner.slice(0, inner.lastIndexOf(':'));
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/shared/monitor-storage.ts
git commit -m "feat: add monitor storage ring buffer helpers"
```

---

## Task 6: Schema validation for new item types

**Files:**
- Modify: `apps/extension/src/shared/schema.ts`

- [ ] **Step 1: Replace `src/shared/schema.ts` with updated version**

```typescript
import type {
  DisplayMode,
  GroupItem,
  Item,
  MetricKey,
  MonitorGraphItem,
  MonitorValueItem,
  NormalizedConfig,
  ServiceItem,
  ValidationResult,
} from './types';

const DISPLAY_MODES: readonly DisplayMode[] = [
  'icon_only',
  'icon_text',
  'text_only',
];

const VALID_ADAPTERS = new Set(['dashdot', 'glances']);
const VALID_METRICS = new Set<MetricKey>([
  'cpu',
  'ram',
  'gpu',
  'network',
  'disk',
]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isUrlLike(v: unknown): v is string {
  if (!isNonEmptyString(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function validateService(raw: any, errors: string[]): ServiceItem | null {
  const displayName = isNonEmptyString(raw?.name) ? (raw.name as string) : '<unnamed>';
  let ok = true;

  if (!isNonEmptyString(raw?.name)) {
    errors.push('Service is missing `name`');
    ok = false;
  }
  if (!isUrlLike(raw?.url)) {
    errors.push(`Service \`${displayName}\` is missing \`url\``);
    ok = false;
  }
  if (raw?.icon !== undefined && typeof raw.icon !== 'string') {
    errors.push(`Service \`${displayName}\` has non-string \`icon\``);
    ok = false;
  }

  if (!ok) return null;
  return {
    type: 'service',
    name: raw.name as string,
    url: raw.url as string,
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
  };
}

function validateMonitorBase(
  raw: any,
  errors: string[],
): { name: string; adapter: 'dashdot' | 'glances'; url: string; metrics?: MetricKey[]; interval?: number } | null {
  const displayName = isNonEmptyString(raw?.name) ? (raw.name as string) : '<unnamed>';
  let ok = true;

  if (!isNonEmptyString(raw?.name)) {
    errors.push('Monitor item is missing `name`');
    ok = false;
  }
  if (!isUrlLike(raw?.url)) {
    errors.push(`Monitor \`${displayName}\` is missing a valid \`url\``);
    ok = false;
  }
  if (!VALID_ADAPTERS.has(raw?.adapter)) {
    errors.push(
      `Monitor \`${displayName}\` has unknown \`adapter\` \`${String(raw?.adapter)}\` — expected: dashdot, glances`,
    );
    ok = false;
  }
  if (raw?.metrics !== undefined) {
    if (
      !Array.isArray(raw.metrics) ||
      !(raw.metrics as unknown[]).every((m) => VALID_METRICS.has(m as MetricKey))
    ) {
      errors.push(
        `Monitor \`${displayName}\` has invalid \`metrics\` — valid values: ${[...VALID_METRICS].join(', ')}`,
      );
      ok = false;
    }
  }
  if (raw?.interval !== undefined && (typeof raw.interval !== 'number' || raw.interval < 1)) {
    errors.push(`Monitor \`${displayName}\` \`interval\` must be a number ≥ 1`);
    ok = false;
  }

  if (!ok) return null;
  return {
    name: raw.name as string,
    adapter: raw.adapter as 'dashdot' | 'glances',
    url: raw.url as string,
    metrics: Array.isArray(raw.metrics) ? (raw.metrics as MetricKey[]) : undefined,
    interval: typeof raw.interval === 'number' ? raw.interval : undefined,
  };
}

function validateMonitorValue(raw: any, errors: string[]): MonitorValueItem | null {
  const base = validateMonitorBase(raw, errors);
  if (!base) return null;
  return { type: 'monitor-value', ...base };
}

function validateMonitorGraph(raw: any, errors: string[]): MonitorGraphItem | null {
  const base = validateMonitorBase(raw, errors);
  if (!base) return null;

  let history: number | undefined;
  if (raw?.history !== undefined) {
    if (typeof raw.history !== 'number' || raw.history < 2) {
      errors.push(`Monitor \`${base.name}\` \`history\` must be a number ≥ 2`);
      return null;
    }
    history = raw.history as number;
  }

  return { type: 'monitor-graph', ...base, history };
}

function validateItem(raw: unknown, errors: string[], context: string): Item | null {
  const type = (raw as any)?.type;
  if (type === 'service') return validateService(raw, errors);
  if (type === 'monitor-value') return validateMonitorValue(raw, errors);
  if (type === 'monitor-graph') return validateMonitorGraph(raw, errors);
  if (type === 'group') {
    errors.push(`${context}: nested groups are not allowed`);
    return null;
  }
  errors.push(`${context}: unknown item type \`${String(type)}\``);
  return null;
}

function validateGroup(raw: any, errors: string[]): GroupItem | null {
  const displayName = isNonEmptyString(raw?.name) ? (raw.name as string) : '<unnamed>';
  let ok = true;

  if (!isNonEmptyString(raw?.name)) {
    errors.push('Group is missing `name`');
    ok = false;
  }
  if (!Array.isArray(raw?.items) || raw.items.length === 0) {
    errors.push(`Group \`${displayName}\` has missing or empty \`items\``);
    ok = false;
  }
  if (raw?.icon !== undefined && typeof raw.icon !== 'string') {
    errors.push(`Group \`${displayName}\` has non-string \`icon\``);
    ok = false;
  }

  if (!ok) return null;

  const children: Item[] = [];
  for (const childRaw of raw.items as unknown[]) {
    const child = validateItem(childRaw, errors, `Group \`${displayName}\``);
    if (child) children.push(child);
  }

  if (children.length === 0) return null;
  return {
    type: 'group',
    name: raw.name as string,
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
    items: children,
  };
}

export function validate(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push('Root must be an object');
    return { ok: false, errors };
  }

  const root = input as Record<string, unknown>;

  if (!Array.isArray(root.items) || root.items.length === 0) {
    errors.push('Root `items` array is missing');
    return { ok: false, errors };
  }

  let displayMode: DisplayMode | undefined;
  if (root.displayMode !== undefined) {
    if (
      typeof root.displayMode !== 'string' ||
      !DISPLAY_MODES.includes(root.displayMode as DisplayMode)
    ) {
      errors.push(`Invalid displayMode \`${String(root.displayMode)}\``);
    } else {
      displayMode = root.displayMode as DisplayMode;
    }
  }

  const items: Item[] = [];
  for (const raw of root.items as unknown[]) {
    const type = (raw as any)?.type;
    if (type === 'group') {
      const item = validateGroup(raw, errors);
      if (item) items.push(item);
    } else {
      const item = validateItem(raw, errors, 'Root');
      if (item) items.push(item);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const config: NormalizedConfig = { items };
  if (typeof root.title === 'string') config.title = root.title;
  if (displayMode) config.displayMode = displayMode;
  return { ok: true, config };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/shared/schema.ts
git commit -m "feat: validate monitor-value and monitor-graph item types in YAML"
```

---

## Task 7: Background polling

**Files:**
- Modify: `apps/extension/src/background/index.ts`

The service worker polls adapters and writes to storage. `chrome.alarms` fires every minute to restart polling if the SW was killed; `setInterval` handles sub-minute intervals while the SW is alive.

- [ ] **Step 1: Replace `src/background/index.ts`**

```typescript
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
  for (const [url, item] of monitors) {
    void poll(item); // immediate first fetch
    const ms = (item.interval ?? 10) * 1000;
    timers.set(url, setInterval(() => void poll(item), ms));
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
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/background/index.ts
git commit -m "feat: background polling loop for monitor items"
```

---

## Task 8: Add host_permissions to manifest

**Files:**
- Modify: `apps/extension/manifest.json`

The background service worker needs explicit `host_permissions` to fetch from local IPs.

- [ ] **Step 1: Update `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Patch Panel",
  "version": "0.1.0",
  "description": "A YAML-driven bookmarks-bar-style launcher for homelab services.",
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "permissions": ["storage", "alarms"],
  "host_permissions": ["http://*/*", "https://*/*"],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle",
      "all_frames": false
    }
  ],
  "options_ui": {
    "page": "src/options/index.html",
    "open_in_tab": true
  },
  "action": {
    "default_title": "Patch Panel"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/extension/manifest.json
git commit -m "feat: add alarms permission and host_permissions for monitor fetch"
```

---

## Task 9: `monitor-value` renderer

**Files:**
- Create: `apps/extension/src/content/monitor-value.ts`
- Modify: `apps/extension/src/content/bar.css`

- [ ] **Step 1: Create `src/content/monitor-value.ts`**

```typescript
import type { MetricKey, MonitorValueItem } from '../shared/types';
import type { MetricSnapshot } from '../adapters/types';
import { getLatest, isMonitorLatestKey, urlFromKey } from '../shared/monitor-storage';

const STALE_MULTIPLIER = 3; // snapshot older than interval × 3 is stale

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

  // Load initial value
  void getLatest(item.url).then((snap) => {
    if (snap) applySnapshot(el, snap, metrics, interval);
  });

  return el;
}

// Called by the content script storage listener
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
```

- [ ] **Step 2: Add monitor-value CSS to `src/content/bar.css`**

Append to the end of `bar.css`:

```css
/* ── Monitor value item ─────────────────────────────────── */
.monitor-value {
  gap: 0;
  max-width: none;
}

.mv-name {
  color: var(--pp-text-dim);
  margin-right: 6px;
  flex-shrink: 0;
}

.mv-metrics {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mv-sep {
  color: var(--pp-divider);
  font-size: 10px;
}

.mv-val {
  font-weight: 600;
  font-size: 10.5px;
}

/* Metric colours — light mode */
.mv-cpu  { color: #3d7a3d; }
.mv-ram  { color: #7a5c9e; }
.mv-gpu  { color: var(--pp-accent); }
.mv-net  { color: #2e7dad; }
.mv-disk { color: #8a6a2e; }
.mv-network { color: #2e7dad; }

@media (prefers-color-scheme: dark) {
  .mv-cpu  { color: #7ee787; }
  .mv-ram  { color: #d2a8ff; }
  .mv-gpu  { color: #ff9d42; }
  .mv-net  { color: #79c0ff; }
  .mv-disk { color: #e3b341; }
  .mv-network { color: #79c0ff; }
}

.monitor-stale {
  opacity: 0.45;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/content/monitor-value.ts apps/extension/src/content/bar.css
git commit -m "feat: monitor-value bar item renderer"
```

---

## Task 10: `monitor-graph` renderer

**Files:**
- Create: `apps/extension/src/content/monitor-graph.ts`
- Modify: `apps/extension/src/content/bar.css`

- [ ] **Step 1: Create `src/content/monitor-graph.ts`**

```typescript
import type { MetricKey, MonitorGraphItem } from '../shared/types';
import type { MetricSnapshot } from '../adapters/types';
import {
  getLatest,
  getReadings,
  isMonitorReadingsKey,
  urlFromKey,
  DEFAULT_HISTORY,
} from '../shared/monitor-storage';

const GRAPH_W = 40;
const GRAPH_H = 14;
const STALE_MULTIPLIER = 3;

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
      const total = r.network ? r.network.up + r.network.down : 0;
      // Normalize against max in window
      return total;
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
  svg.dataset.metric = metric;

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

  if (context === 'bar') {
    // Full sparkline view
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

    // Load initial readings
    void getReadings(item.url).then((readings) => applyReadings(cells, readings));

    // Store cells reference for live updates via data attribute
    (el as any).__mgCells = cells;
    (el as any).__mgHistory = history;
  } else {
    // Compact dropdown view — just values, no sparklines
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
      span.className = `mv-val mg-${key}`;
      span.dataset.metric = key;
      span.textContent = '--';
      metricsEl.appendChild(span);
    }

    el.appendChild(metricsEl);

    void getLatest(item.url).then((snap) => {
      if (!snap) return;
      el.querySelectorAll<HTMLElement>('[data-metric]').forEach((s) => {
        s.textContent = fmtVal(snap, s.dataset.metric as MetricKey);
      });
    });
  }

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
```

- [ ] **Step 2: Add monitor-graph CSS to `src/content/bar.css`**

Append to end of `bar.css`:

```css
/* ── Monitor graph item ─────────────────────────────────── */

/* CSS vars for SVG stroke colours — must live on :host */
:host {
  --mg-cpu:  #3d7a3d;
  --mg-ram:  #7a5c9e;
  --mg-gpu:  #b8541f;
  --mg-net:  #2e7dad;
  --mg-disk: #8a6a2e;
}

@media (prefers-color-scheme: dark) {
  :host {
    --mg-cpu:  #7ee787;
    --mg-ram:  #d2a8ff;
    --mg-gpu:  #ff9d42;
    --mg-net:  #79c0ff;
    --mg-disk: #e3b341;
  }
}

.monitor-graph {
  gap: 6px;
  max-width: none;
}

.mg-name {
  color: var(--pp-text-dim);
  font-size: 10.5px;
  flex-shrink: 0;
}

.mg-graphs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mg-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.mg-val {
  font-size: 8.5px;
  font-weight: 700;
  line-height: 1;
}

.mg-cpu  { color: var(--mg-cpu); }
.mg-ram  { color: var(--mg-ram); }
.mg-gpu  { color: var(--mg-gpu); }
.mg-network { color: var(--mg-net); }
.mg-disk { color: var(--mg-disk); }
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/content/monitor-graph.ts apps/extension/src/content/bar.css
git commit -m "feat: monitor-graph bar item renderer with SVG sparklines"
```

---

## Task 11: Update `group.ts` to dispatch child items by type

**Files:**
- Modify: `apps/extension/src/content/group.ts`

- [ ] **Step 1: Replace `src/content/group.ts`**

```typescript
import type { GroupItem, Item } from '../shared/types';
import { renderIcon, renderServiceItem } from './item';
import { renderMonitorValue } from './monitor-value';
import { renderMonitorGraph } from './monitor-graph';
import { attachDropdown } from './dropdown';

function renderChildItem(item: Item): HTMLElement {
  if (item.type === 'service') return renderServiceItem(item);
  if (item.type === 'monitor-value') return renderMonitorValue(item, 'dropdown');
  if (item.type === 'monitor-graph') return renderMonitorGraph(item, 'dropdown');
  // type: 'group' is blocked by schema validation — unreachable
  return renderServiceItem(item as never);
}

export function renderGroupItem(
  g: GroupItem,
  shadow: ShadowRoot,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'item group';
  btn.type = 'button';
  btn.title = g.name;

  btn.appendChild(renderIcon(g));

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = g.name;
  btn.appendChild(label);

  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.textContent = '▾';
  btn.appendChild(caret);

  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown';
  for (const child of g.items) {
    dropdown.appendChild(renderChildItem(child));
  }

  attachDropdown(btn, dropdown, shadow);

  return btn;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/content/group.ts
git commit -m "feat: group.ts dispatches child items by type"
```

---

## Task 12: Wire everything together in `bar.ts` and `content/index.ts`

**Files:**
- Modify: `apps/extension/src/content/bar.ts`
- Modify: `apps/extension/src/content/index.ts`

- [ ] **Step 1: Update `src/content/bar.ts`**

Replace the `renderBar` function body's item-rendering loop and add imports:

```typescript
import type { BarPosition, DisplayMode, NormalizedConfig } from '../shared/types';
import { BAR_HEIGHT_DEFAULT, BAR_WIDTH_DEFAULT } from '../shared/types';
import { renderServiceItem } from './item';
import { renderGroupItem } from './group';
import { renderMonitorValue, handleMonitorLatestChange } from './monitor-value';
import { renderMonitorGraph, handleMonitorReadingsChange } from './monitor-graph';
import { isMonitorLatestKey, isMonitorReadingsKey, urlFromKey } from '../shared/monitor-storage';
import { closeAll as closeAllDropdowns, setBarContext } from './dropdown';
import { configureAutoHide } from './autohide';
import type { MetricSnapshot } from '../adapters/types';
import barCss from './bar.css?inline';

const HOST_ID = 'patch-panel-host';

export interface BarOptions {
  config: NormalizedConfig;
  mode: DisplayMode;
  position: BarPosition;
  barHeight: number;
  barWidth: number;
  autoHide: boolean;
}

function applyHostStyles(
  host: HTMLElement,
  position: BarPosition,
  heightPx: number,
  widthPx: number,
) {
  const common = [
    'all: initial',
    'position: fixed !important',
    'z-index: 2147483647 !important',
    'pointer-events: auto !important',
    'display: block !important',
    'transition: transform 0.15s ease-out !important',
    `--bar-height: ${heightPx}px`,
    `--bar-width: ${widthPx}px`,
  ];

  let positional: string[];
  if (position === 'top') {
    positional = [
      'top: 0 !important',
      'left: 0 !important',
      'right: 0 !important',
      'bottom: auto !important',
      `height: ${heightPx}px !important`,
      'width: auto !important',
    ];
  } else if (position === 'left') {
    positional = [
      'top: 0 !important',
      'left: 0 !important',
      'right: auto !important',
      'bottom: 0 !important',
      `width: ${widthPx}px !important`,
      'height: auto !important',
    ];
  } else {
    positional = [
      'top: 0 !important',
      'left: auto !important',
      'right: 0 !important',
      'bottom: 0 !important',
      `width: ${widthPx}px !important`,
      'height: auto !important',
    ];
  }

  host.setAttribute('style', [...common, ...positional].join('; '));
}

function getOrCreateHost(
  position: BarPosition,
  heightPx: number,
  widthPx: number,
): { host: HTMLElement; shadow: ShadowRoot } {
  const existing = document.getElementById(HOST_ID);
  if (existing && existing.shadowRoot) {
    applyHostStyles(existing, position, heightPx, widthPx);
    return { host: existing, shadow: existing.shadowRoot };
  }
  const host = document.createElement('div');
  host.id = HOST_ID;
  applyHostStyles(host, position, heightPx, widthPx);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);
  return { host, shadow };
}

function renderCogButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'item cog';
  btn.type = 'button';
  btn.title = 'Patch Panel settings';
  btn.setAttribute('aria-label', 'Open Patch Panel settings');
  btn.textContent = '⚙';
  btn.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  });
  return btn;
}

let activeShadow: ShadowRoot | null = null;

export function renderBar(opts: BarOptions) {
  closeAllDropdowns();

  const heightPx = opts.barHeight || BAR_HEIGHT_DEFAULT;
  const widthPx = opts.barWidth || BAR_WIDTH_DEFAULT;
  const { host, shadow } = getOrCreateHost(opts.position, heightPx, widthPx);
  shadow.innerHTML = '';
  activeShadow = shadow;

  const style = document.createElement('style');
  style.textContent = barCss;
  shadow.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.dataset.mode = opts.mode;
  bar.dataset.position = opts.position;

  for (const item of opts.config.items) {
    if (item.type === 'service') {
      bar.appendChild(renderServiceItem(item));
    } else if (item.type === 'group') {
      bar.appendChild(renderGroupItem(item, shadow));
    } else if (item.type === 'monitor-value') {
      bar.appendChild(renderMonitorValue(item));
    } else if (item.type === 'monitor-graph') {
      bar.appendChild(renderMonitorGraph(item));
    }
  }

  bar.appendChild(renderCogButton());
  shadow.appendChild(bar);

  setBarContext({
    position: opts.position,
    barHeight: heightPx,
    barWidth: widthPx,
  });

  configureAutoHide(host, {
    enabled: opts.autoHide,
    position: opts.position,
    barHeight: heightPx,
    barWidth: widthPx,
  });
}

export function unmountBar() {
  closeAllDropdowns();
  activeShadow = null;
  const host = document.getElementById(HOST_ID);
  if (host) host.remove();
}

// Called by content/index.ts storage listener for monitor data changes.
export function handleMonitorStorageChange(
  key: string,
  newValue: unknown,
): void {
  if (!activeShadow) return;
  if (isMonitorLatestKey(key)) {
    handleMonitorLatestChange(key, newValue as MetricSnapshot, activeShadow);
  } else if (isMonitorReadingsKey(key)) {
    handleMonitorReadingsChange(key, newValue as MetricSnapshot[], activeShadow);
  }
}
```

- [ ] **Step 2: Update `src/content/index.ts`**

```typescript
import { getState, onStateChange } from '../shared/storage';
import type { StoredState } from '../shared/types';
import {
  BAR_HEIGHT_DEFAULT,
  BAR_POSITION_DEFAULT,
  BAR_WIDTH_DEFAULT,
} from '../shared/types';
import { renderBar, unmountBar, handleMonitorStorageChange } from './bar';
import { isMonitorLatestKey, isMonitorReadingsKey } from '../shared/monitor-storage';

function apply(state: StoredState) {
  if (state.config && state.config.items.length > 0) {
    renderBar({
      config: state.config,
      mode: state.displayMode ?? 'icon_text',
      position: state.barPosition ?? BAR_POSITION_DEFAULT,
      barHeight: state.barHeight ?? BAR_HEIGHT_DEFAULT,
      barWidth: state.barWidth ?? BAR_WIDTH_DEFAULT,
      autoHide: state.autoHide ?? false,
    });
  } else {
    unmountBar();
  }
}

// In-place update for monitor data — no full re-render
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const [key, change] of Object.entries(changes)) {
    if (isMonitorLatestKey(key) || isMonitorReadingsKey(key)) {
      handleMonitorStorageChange(key, change.newValue);
    }
  }
});

async function init() {
  const state = await getState();
  apply(state);
  onStateChange(apply);
}

void init();
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/extension && pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/content/bar.ts apps/extension/src/content/index.ts
git commit -m "feat: wire monitor renderers into bar and add in-place live updates"
```

---

## Task 13: Update example YAML and build

**Files:**
- Modify: `apps/extension/examples/homelab.yaml`

- [ ] **Step 1: Add monitor examples to `homelab.yaml`**

Add the following to the `items` array:

```yaml
  # Standalone monitor-value — shows live numbers in the bar
  - type: monitor-value
    name: Mac Studio
    adapter: dashdot
    url: http://192.168.1.10:3001
    metrics: [cpu, ram, gpu]
    interval: 10

  # Standalone monitor-graph — shows sparklines in the bar
  - type: monitor-graph
    name: NAS
    adapter: glances
    url: http://192.168.1.20:61208
    metrics: [cpu, ram]
    history: 20

  # Mixed group — any item type can live inside a group
  - type: group
    name: Servers
    items:
      - type: monitor-graph
        name: Mac Studio
        adapter: dashdot
        url: http://192.168.1.10:3001
        metrics: [cpu, ram, gpu]
      - type: monitor-value
        name: NAS
        adapter: glances
        url: http://192.168.1.20:61208
        metrics: [cpu, ram, disk]
      - type: service
        name: Grafana
        url: http://grafana.local
```

- [ ] **Step 2: Full build**

```bash
pnpm typecheck && pnpm build
```

Expected: TypeScript clean, Vite builds the extension to `apps/extension/dist/`.

- [ ] **Step 3: Load the extension and manually test**

1. Open `chrome://extensions` → enable Developer Mode → "Load unpacked" → select `apps/extension/dist/`
2. Open the options page, paste a YAML with a `monitor-value` item pointing at a running Dash. or Glances instance
3. Verify: bar shows the item with live values
4. Paste a `monitor-graph` item — verify sparklines appear and update
5. Paste a `type: group` with a mix of monitor and service items — verify the dropdown renders all correctly
6. Stop the monitored machine — verify values go dim with `⚠` after ~30s

- [ ] **Step 4: Final commit**

```bash
git add apps/extension/examples/homelab.yaml
git commit -m "docs: add monitor-value and monitor-graph examples to homelab.yaml"
```
