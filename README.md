# Patch Panel

![Patch Panel demo](./docs/Cap%202026-04-24%20at%2000.11.08.gif)

A YAML-driven, bookmarks-bar-style launcher for homelab services with live system metrics.

**[patch-panel.balubabu.dev](https://patch-panel.balubabu.dev/)** — [Chrome Web Store](https://chromewebstore.google.com/detail/patch-panel/cahgdpcbmgjmoknbndcmgmabnlffaaod)

Patch Panel is a Chrome extension that injects a thin bar across the top of every page, giving you one-click access to your self-hosted services. You describe your homelab in a single YAML file services, groups, icons, monitors and the bar renders from it.

## Why

I wanted a lightweight alternative to the usual homelab dashboards like [Homer](https://github.com/bastienwirtz/homer) and [Dashy](https://github.com/Lissy93/dashy). They're great, but they take over an entire tab. I wanted the configurability of a YAML-driven dashboard without having to dedicate a whole tab to it. Patch Panel lives as a thin bar on top of whatever page you're already on, so your self-hosted services are always one click away.

## Repository layout

This is a pnpm monorepo.

```
apps/
  extension/   Chrome MV3 extension (Vite + TypeScript)
  landing/     Static landing page
```

- `apps/extension` — the extension itself. Content script renders the bar, options page edits the YAML, background service worker handles storage and metric polling.
- `apps/landing` — a static HTML/CSS landing page.

## Getting started

Requires [pnpm](https://pnpm.io/) (v10+).

```sh
pnpm install
```

### Extension

```sh
pnpm dev            # vite dev build for the extension
pnpm build          # typecheck + build all workspaces
```

Load the extension in Chrome:

1. Run `pnpm build` (output lands in `apps/extension/dist`).
2. Go to `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select `apps/extension/dist`.
4. Open the extension's **Options** page to paste or upload your YAML config.

See `apps/extension/examples/homelab.yaml` for a reference config.

### Landing page

```sh
pnpm --filter landing dev   # serves on http://localhost:4321
```

## Config format

```yaml
title: My Homelab
displayMode: icon_text   # icon_only | text_only | icon_text
```

### Service items

A clickable link to a self-hosted service.

```yaml
items:
  - type: service
    name: Grafana
    url: https://grafana.local
    icon: https://www.google.com/s2/favicons?domain=grafana.com&sz=64
```

### Group items

A hover dropdown that can contain services and monitor items mixed together.

```yaml
  - type: group
    name: Media
    icon: https://www.google.com/s2/favicons?domain=plex.tv&sz=64
    items:
      - type: service
        name: Plex
        url: http://plex.local:32400/web
      - type: monitor-value
        name: NAS
        adapter: glances
        url: http://nas.local:61208
        metrics: [cpu, ram, disk]
```

### Monitor items

Monitor items poll a system metrics API on a configurable interval and display live readings in the bar. The background service worker handles polling and stores a rolling history in `chrome.storage` so the bar updates in-place without re-rendering.

Two supported adapters:

| Adapter | Tested against |
|---------|---------------|
| `glances` | [Glances](https://github.com/nicolargo/glances) API v4 (`/api/4/all`) |
| `dashdot` | [Dash.](https://github.com/MauriceNino/dashdot) (`/load/*` endpoints) |

Available metrics: `cpu` · `ram` · `gpu` · `disk` · `network`

#### monitor-value

Displays the latest reading for each metric as a text label.

```yaml
  - type: monitor-value
    name: Mac Studio
    adapter: dashdot
    url: http://192.168.1.10:3001
    metrics: [cpu, ram, gpu]  # default: [cpu, ram]
    interval: 10              # poll interval in seconds, default 10
```

#### monitor-graph

Displays a compact SVG sparkline per metric, with the latest value alongside it.

```yaml
  - type: monitor-graph
    name: NAS
    adapter: glances
    url: http://192.168.1.20:61208
    metrics: [cpu, ram]  # default: [cpu, ram]
    interval: 10         # poll interval in seconds, default 10
    history: 20          # number of readings shown in the sparkline, default 20
```

Both monitor item types can be placed at the top level or nested inside a group.

## Bar appearance

Bar position and size are configured from the extension's Options page (not in YAML). Available settings:

| Setting | Options | Default |
|---------|---------|---------|
| Position | `top` · `left` · `right` | `top` |
| Height (top bar) | 20–60 px | 30 px |
| Width (side bar) | 40–320 px | 180 px |
| Auto-hide | on / off | off |

When auto-hide is enabled the bar slides out of view until you hover near the edge of the screen.
