# Monitor Items Design

**Date:** 2026-05-07
**Status:** Draft

## Context

patch-panel is a Chrome MV3 extension that injects a configurable bookmark bar into every page. Users configure it with YAML. The goal is to add two new item types `monitor-value` and `monitor-graph` that display live system metrics (CPU, RAM, GPU, network) directly in the bar, sourced from Dash. or Glances running on each machine.

This follows Homarr's approach: no custom agent, just HTTP polling of existing monitoring daemons that expose standard REST APIs.

---

## Architecture

The extension's background service worker reads the YAML config, finds all monitor items (including ones nested inside groups), and polls each unique machine's Dash./Glances API at a configurable interval. Readings are stored as ring buffers in `chrome.storage.local`. Content scripts subscribe to storage changes and update the bar live.

```
Background SW                    chrome.storage.local
───────────────                  ────────────────────
read config                      pp:monitor:<url>:readings  ← ring buffer (last N)
  → collect monitor items        pp:monitor:<url>:latest    ← current snapshot
  → deduplicate by URL
  → per-URL setInterval
      → fetch Dash./Glances
      → push to ring buffer      Content script
      → write latest        →    subscribe storage.onChanged
                                 re-render monitor items
```

No central server. No WebSocket. The browser IS the aggregator — just like Homarr's server is, but lighter.

---

## Component Model

Every item type is an independent renderable unit. `type: group` holds an array of any item type.

### Type system (`shared/types.ts`)

```typescript
// Existing — unchanged
export interface ServiceItem {
  type: 'service';
  name: string;
  url: string;
  icon?: string;
}

// New
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
  history?: number;        // readings in sparkline, default 20
}

export type MetricKey = 'cpu' | 'ram' | 'gpu' | 'network' | 'disk';

// GroupItem.items expands from ServiceItem[] → Item[]
export interface GroupItem {
  type: 'group';
  name: string;
  icon?: string;
  items: Item[];  // ← was ServiceItem[]
}

export type Item = ServiceItem | GroupItem | MonitorValueItem | MonitorGraphItem;
```

### Rendering dispatch (`content/bar.ts`)

```typescript
for (const item of opts.config.items) {
  if (item.type === 'service')        bar.appendChild(renderServiceItem(item));
  else if (item.type === 'group')     bar.appendChild(renderGroupItem(item, shadow));
  else if (item.type === 'monitor-value') bar.appendChild(renderMonitorValue(item));
  else if (item.type === 'monitor-graph') bar.appendChild(renderMonitorGraph(item));
}
```

`renderGroupItem` already iterates its `items` array — it just needs to dispatch the same way instead of assuming all children are service items.

---

## YAML Config

```yaml
# Standalone monitor-value in the bar
- type: monitor-value
  name: Mac Studio
  adapter: dashdot
  url: http://192.168.1.10:3001
  metrics: [cpu, ram, gpu]
  interval: 10

# Standalone monitor-graph in the bar
- type: monitor-graph
  name: NAS
  adapter: glances
  url: http://192.168.1.20:61208
  metrics: [cpu, ram]
  history: 20

# Mixed group — any item type inside a group
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

---

## Adapter Layer

Thin clients that normalise Dash. and Glances responses into a shared `MetricSnapshot`.

```typescript
// adapters/types.ts
export interface MetricSnapshot {
  ts: number;
  cpu?: number;          // 0–100
  ram?: number;          // 0–100
  gpu?: number;          // 0–100
  network?: { up: number; down: number };  // bytes/s
  disk?: number;         // 0–100 (first filesystem)
}
```

**Dash. adapter** (`adapters/dashdot.ts`)
- `GET /load/cpu` → average across cores
- `GET /load/ram` → used / total
- `GET /load/gpu` → first GPU load
- `GET /load/network` → up/down bytes/s
- `GET /load/storage` → first filesystem used %
- All fetched in parallel with `Promise.all`

**Glances adapter** (`adapters/glances.ts`)
- Single `GET /api/4/all` → extract cpu.total, mem, gpu[0], network, fs[0]
- One round-trip regardless of how many metrics are requested

---

## Storage Schema

Keys in `chrome.storage.local`:

| Key | Value | Notes |
|-----|-------|-------|
| `pp:monitor:<url>:latest` | `MetricSnapshot` | Updated every interval |
| `pp:monitor:<url>:readings` | `MetricSnapshot[]` | Ring buffer, max `history` entries |

`<url>` is the raw URL string from config (e.g. `http://192.168.1.10:3001`).

Helper module `shared/monitor-storage.ts` owns all read/write, enforces the ring buffer cap, and is the only code that touches these keys.

---

## Background Polling (`background/index.ts`)

1. On startup and on storage change (user updates YAML): re-read config, collect all `MonitorValueItem | MonitorGraphItem` items (flatten groups recursively), deduplicate by `url`.
2. Clear any previous `setInterval` timers.
3. For each unique machine: start a `setInterval` at the configured `interval` (or 10s default).
4. On each tick: call the right adapter → push snapshot into ring buffer → write `latest` to storage.
5. Content scripts receive `chrome.storage.onChanged` and re-render their items.

Interval deduplication: if two items share the same `url` but different `interval` values, use the shorter one.

---

## Content Script Rendering

### `monitor-value` (`content/monitor-value.ts`)

Renders as a `.item` div (matches existing bar item class). Shows each requested metric as `<label> <value>` pairs separated by `·`.

```
Mac Studio  cpu 34% · ram 61% · gpu 12%
```

Colors follow the design: CPU green (`#7ee787`), RAM purple (`#d2a8ff`), GPU orange (`#ff9d42`), network blue (`#79c0ff`).

Subscribes to `chrome.storage.onChanged` filtered to `pp:monitor:<url>:latest` and updates the value spans in-place (no full re-render).

### `monitor-graph` (`content/monitor-graph.ts`)

Renders as a `.item` div. Shows the machine name, then one inline SVG sparkline per metric with the current value below it.

Sparklines are `<polyline>` elements scaled to the reading history. Points are normalized 0–100 → 0–height.

Subscribes to `chrome.storage.onChanged` filtered to `pp:monitor:<url>:readings` and redraws the SVG polyline points in-place.

### Inside a group dropdown

When a monitor item appears as a child of `type: group`, it renders inside the dropdown panel (30px tall rows). Both types use a compact single-line format in that context:

- `monitor-value` — same as bar, no change needed (it's already single-line)
- `monitor-graph` — drops the sparklines, shows name + current values only (same as `monitor-value`). Sparklines only render when the item is a top-level bar item with full height.

The render functions receive a `context: 'bar' | 'dropdown'` argument to switch between the two layouts.

### Stale / error state

If a fetch fails, the last known value is shown dimmed (`opacity: 0.45`) with a `⚠` prefix. No retry storm — just wait for the next interval.

---

## Files to Create / Modify

### New files
| File | Purpose |
|------|---------|
| `src/adapters/types.ts` | `MetricSnapshot`, `MonitorAdapter` interface |
| `src/adapters/dashdot.ts` | Dash. HTTP client |
| `src/adapters/glances.ts` | Glances HTTP client |
| `src/shared/monitor-storage.ts` | Ring buffer read/write helpers |
| `src/content/monitor-value.ts` | `renderMonitorValue()` + live updater |
| `src/content/monitor-graph.ts` | `renderMonitorGraph()` + sparkline updater |

### Modified files
| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `MonitorValueItem`, `MonitorGraphItem`, `MetricKey`; expand `GroupItem.items`; expand `Item` union |
| `src/shared/parse.ts` | YAML validation for new item types; recursive group parsing |
| `src/content/bar.ts` | Dispatch to new renderers |
| `src/content/group.ts` | Dispatch child items by type instead of casting all as `ServiceItem` |
| `src/content/bar.css` | Sparkline and value styles (`.monitor-value`, `.monitor-graph`, `.mg-graph`, etc.) |
| `src/background/index.ts` | Polling loop, interval management, adapter dispatch |
| `manifest.json` | Add `host_permissions: ["http://*/*", "https://*/*"]` so the background service worker can fetch from local IPs (content scripts already have this via `matches`, but background SW fetch requires explicit host permissions) |

---

## Error Handling

- **Fetch timeout:** 5s per request via `AbortController`. On timeout, mark stale.
- **Non-200 response:** Mark stale. Log to console in dev.
- **Adapter not found:** Fail at parse time with a clear validation error in the options page.
- **`chrome.storage.local` quota:** At 20 readings × ~100 bytes × 10 machines = ~20 KB. Well within the 5 MB default quota.

---

## Verification

1. Add a `monitor-value` item pointing at a local Dash. instance → bar shows live CPU/RAM values, updates every 10s.
2. Add a `monitor-graph` item → sparklines appear, trend updates as new readings come in.
3. Nest both types inside a `type: group` → dropdown renders the mix correctly.
4. Unplug the monitored machine → values dim with `⚠`, extension doesn't crash.
5. Change `interval` in YAML → old timer clears, new one starts at the right cadence.
6. Open the options page YAML editor with an invalid `adapter` value → validation error shown.
