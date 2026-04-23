# Patch Panel — Design Spec

Status: approved, 2026-04-23.

## Scope

V1 implementation of the Patch Panel Chrome extension as specified in the product PRD. A Manifest V3 extension that renders a persistent, bookmarks-bar-style launcher for homelab services, driven by a user-supplied YAML file. Everything else listed under PRD §4 "Non-Goals" is out of scope.

## Stack

- TypeScript (strict).
- Vite 5, built with `@crxjs/vite-plugin` so the manifest is the source of truth for entry points (content script, service worker, options page).
- `js-yaml` for YAML parsing.
- No UI framework. The bar is small enough that direct DOM is simpler than React.
- No CSS framework. Plain CSS scoped inside a Shadow DOM.
- No validation library. Hand-rolled validator matches PRD error-message wording exactly.
- No tests — explicitly deprioritised for V1 per user direction. Validation correctness is verified manually against the PRD fixture and adversarial YAML.

## Extension surfaces

Three runtime surfaces plus a shared module.

### `src/content/` — content script

- Injected into every `http://*/*` and `https://*/*` page at `run_at: "document_idle"`. Chrome silently skips restricted pages (`chrome://`, Web Store, `view-source:` etc.), which is the behaviour PRD §17 already accepts.
- Creates one host `<div id="patch-panel-host">` appended to `document.body`, attaches an **open** shadow root, and renders the bar inside. All CSS lives inside the shadow root; no styles leak in either direction.
- Reads the normalised config + display mode from `chrome.storage.local` on load, and re-renders on `chrome.storage.onChanged`. Storage changes from the options page therefore hot-reload the bar across every open tab with no refresh.
- Renders nothing (no host div at all) if there is no valid config yet — per PRD §11.2.

### `src/options/` — options page

- Plain HTML page registered as `options_ui` in the manifest. Chrome reaches it via the extension's Options entry in `chrome://extensions` and via a first-run action.
- Controls: a file input for YAML upload, a select for display mode (`icon_only` / `icon_text` / `text_only`), a read-only preview of the last valid raw YAML, and a status region for success / error messages.
- On upload: read the file client-side, parse with `js-yaml`, validate with `src/shared/schema.ts`, and on success write `{ rawYaml, config, displayMode, schemaVersion: 1 }` to `chrome.storage.local`. On failure, show the validator's error list and leave prior stored state untouched.

### `src/background/` — service worker

- Minimal. `chrome.runtime.onInstalled` opens the options page on first install so the user has an obvious next step.
- Nothing else runs here. Navigation is handled by plain `<a target="_blank" rel="noopener">` in the content script; no message round-trip needed.

### `src/shared/` — shared module

- `types.ts` — `ServiceItem`, `GroupItem`, `NormalizedConfig`, `DisplayMode`, `StoredState`, `ValidationResult`.
- `schema.ts` — pure validator: `validate(input: unknown): ValidationResult`. Returns either `{ ok: true, config }` or `{ ok: false, errors: string[] }`. Error messages match PRD §11.3 wording (`"Invalid YAML syntax"`, `"Root \`items\` array is missing"`, `"Group \`Monitoring\` contains an invalid child item"`, `"Service \`Grafana\` is missing \`url\`"`).
- `parse.ts` — `parseYaml(raw: string): ValidationResult`. Wraps `js-yaml.load` in a try/catch (turning thrown errors into the single `"Invalid YAML syntax"` error) and hands the result to `validate`.
- `storage.ts` — typed `getState()`, `setState(partial)`, `onStateChange(cb)` wrappers over `chrome.storage.local`.

## Schema and validation

Root keys: `title?: string`, `displayMode?: "icon_only" | "icon_text" | "text_only"`, `items: Item[]` (required, non-empty).

Item is a discriminated union on `type`:
- `service`: requires `name: non-empty string`, `url: non-empty string`. Optional `icon: string`. `url` is considered reasonably URL-like if it is a non-empty string that parses with `new URL(url)` OR starts with `http://` / `https://`. The PRD says "reasonably URL-like" — we accept anything the browser's URL parser accepts, which is permissive enough for `https://proxmox.local`.
- `group`: requires `name: non-empty string`, `items: Item[]` (required, non-empty). Optional `icon: string`. Every child must be a valid service — groups containing groups fail validation with `"Nested groups are not allowed"`.

Any unknown `type` fails with `"Unknown item type \`<value>\`"`. Invalid `displayMode` fails with `"Invalid displayMode \`<value>\`"`. Validation collects all errors, not just the first — the options page shows them as a list so users can fix the whole file in one pass.

On a failed validation, the options page displays errors inline and does not touch storage, guaranteeing PRD §10.1 "prior valid config remains active."

## Storage shape

```ts
type StoredState = {
  rawYaml: string;           // last valid YAML, for display in options page
  config: NormalizedConfig;  // parsed + validated
  displayMode: DisplayMode;  // global display mode
  schemaVersion: 1;          // for future migrations
};
```

All four keys are stored under `chrome.storage.local`. The storage wrapper returns `undefined` for each key if absent, and the content script treats "no config" as "render nothing."

## UI details

- **Bar**: `position: fixed; top: 0; left: 0; right: 0; height: 30px; z-index: 2147483647;` — a true overlay. It covers the top ~30 px of the page rather than pushing content down. This matches PRD §14.4 "fixed-position top overlay" and is the trade-off accepted at design review.
- **Display mode** is a single `data-mode="icon_only|icon_text|text_only"` attribute on the bar root. CSS selectors key off it to hide/show icon and label. Switching modes is one attribute write — no re-render.
- **Dropdowns**:
  - Open on `mouseenter` of the group button.
  - Close on `mouseleave` with a 150 ms timeout.
  - The timeout is cleared if the pointer enters the dropdown panel (so there is no dead zone between group and dropdown).
  - Also close on: Escape keypress, scroll of the page, window resize, and click outside the bar.
  - Only one dropdown is open at a time — opening a new one closes the current one immediately.
  - Dropdown panel has `max-height: 70vh; overflow-y: auto;` so large groups are scrollable.
- **Service items** render as `<a href={url} target="_blank" rel="noopener">`. Navigation needs no JS and no background messaging. Click opens a new tab; browser handles it.
- **Icons**: `<img src={icon}>` with `onerror` swapping in a `<span class="fallback">` containing the first letter of the name. If the display mode is `icon_only` or `icon_text` and no icon is set at all, the same letter-fallback is used from the start.
- **Long names**: truncate with `text-overflow: ellipsis; max-width: 180px; white-space: nowrap;` and set `title={name}` on the item so the full name shows on native hover.
- **Empty state**: when no valid config exists, the content script returns without creating the host div. The options page shows a short instructional block prompting the user to upload a YAML file.

## Manifest

```json
{
  "manifest_version": 3,
  "name": "Patch Panel",
  "version": "0.1.0",
  "description": "A YAML-driven bookmarks-bar-style launcher for homelab services.",
  "permissions": ["storage"],
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ],
  "options_ui": { "page": "src/options/index.html", "open_in_tab": true },
  "action": { "default_title": "Patch Panel" }
}
```

No `host_permissions`. Remote icon `<img>` loads do not require them.

## Project layout

```
patch-panel/
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ manifest.json
├─ docs/superpowers/specs/2026-04-23-patch-panel-design.md
└─ src/
   ├─ shared/
   │  ├─ types.ts
   │  ├─ schema.ts
   │  ├─ parse.ts
   │  └─ storage.ts
   ├─ content/
   │  ├─ index.ts
   │  ├─ bar.ts
   │  ├─ item.ts
   │  ├─ group.ts
   │  ├─ dropdown.ts
   │  └─ bar.css
   ├─ options/
   │  ├─ index.html
   │  ├─ index.ts
   │  └─ options.css
   └─ background/
      └─ index.ts
```

## Build, load, and verify

- `npm run dev` — Vite dev build with `@crxjs` HMR. Load `dist/` as unpacked in `chrome://extensions`.
- `npm run build` — production build to `dist/`.
- Manual smoke test: load unpacked, open options, upload the PRD §12.1 fixture YAML, confirm bar renders across a fresh tab, hover "Monitoring", click a child, confirm new tab. Toggle display mode. Upload broken YAML, confirm error shown and prior bar still intact. Restart Chrome, confirm bar and mode persist.

## Explicit YAGNI list

No host permissions. No message passing for navigation. No per-site opt-out. No remote YAML. No health checks. No tests. No React. No CSS framework. No Zod. No tab-groups API. No left/right placement. No search. No drag-drop editor. No nested groups. No command palette. Anything in PRD §4 or §20 "Must Not Do" stays out.
