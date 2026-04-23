# Patch Panel

A YAML-driven, bookmarks-bar-style launcher for homelab services.

Patch Panel is a Chrome extension that injects a thin bar across the top of every page, giving you one-click access to your self-hosted services. You describe your homelab in a single YAML file — services, groups, icons — and the bar renders from it.

## Repository layout

This is a pnpm monorepo.

```
apps/
  extension/   Chrome MV3 extension (Vite + TypeScript)
  landing/     Static landing page
```

- `apps/extension` — the extension itself. Content script renders the bar, options page edits the YAML, background service worker handles storage.
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
displayMode: icon_text   # icon | text | icon_text

items:
  - type: service
    name: Grafana
    url: https://grafana.local
    icon: https://www.google.com/s2/favicons?domain=grafana.com&sz=64

  - type: group
    name: Media
    items:
      - type: service
        name: Plex
        url: http://plex.local:32400/web
```

Top-level `items` is a mix of `service` entries and `group` entries. Groups render as a hover dropdown on the bar.
