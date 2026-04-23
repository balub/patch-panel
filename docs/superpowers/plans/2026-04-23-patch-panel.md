# Patch Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension that renders a YAML-driven, bookmarks-bar-style launcher for homelab services. V1 scope only.

**Architecture:** Vanilla TypeScript, bundled by Vite with `@crxjs/vite-plugin`. Three extension surfaces — content script (Shadow-DOM-isolated top bar injected into every http(s) page), options page (YAML upload + display mode), and a minimal service worker. All state lives in `chrome.storage.local`; storage change events hot-reload the bar across all tabs. Navigation uses plain `<a target="_blank">` — no messaging round-trip.

**Tech Stack:** TypeScript 5, Vite 5, `@crxjs/vite-plugin` 2, `js-yaml` 4. No React. No CSS framework. No validation library. No tests — deliberately deprioritised per user direction.

Spec: `docs/superpowers/specs/2026-04-23-patch-panel-design.md`

---

## Task 1: Project scaffolding

**Files:**
- Create: `/Users/balubabu/projects/patch-panel/package.json`
- Create: `/Users/balubabu/projects/patch-panel/tsconfig.json`
- Create: `/Users/balubabu/projects/patch-panel/vite.config.ts`
- Create: `/Users/balubabu/projects/patch-panel/manifest.json`
- Create: `/Users/balubabu/projects/patch-panel/.gitignore`
- Create: `/Users/balubabu/projects/patch-panel/src/env.d.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "patch-panel",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "A YAML-driven bookmarks-bar-style launcher for homelab services.",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@types/chrome": "^0.0.268",
    "@types/js-yaml": "^4.0.9",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  },
  "dependencies": {
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "allowImportingTsExtensions": false,
    "types": ["chrome", "vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "vite.config.ts", "manifest.json"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
```

- [ ] **Step 4: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Patch Panel",
  "version": "0.1.0",
  "description": "A YAML-driven bookmarks-bar-style launcher for homelab services.",
  "permissions": ["storage"],
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

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
.vite/
```

- [ ] **Step 6: Write `src/env.d.ts`**

```ts
/// <reference types="chrome" />
/// <reference types="vite/client" />

declare module '*.css?inline' {
  const content: string;
  export default content;
}
```

- [ ] **Step 7: Initialise git and install dependencies**

Run from `/Users/balubabu/projects/patch-panel`:

```bash
git init
npm install
```

Expected: `node_modules/` populated, no npm errors. `@crxjs/vite-plugin` resolves (it is a beta — accept any `^2.0.0-beta.*` version npm installs).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts manifest.json .gitignore src/env.d.ts
git commit -m "chore: scaffold patch panel extension project"
```

---

## Task 2: Shared types

**Files:**
- Create: `/Users/balubabu/projects/patch-panel/src/shared/types.ts`

- [ ] **Step 1: Write `src/shared/types.ts`**

```ts
export type DisplayMode = 'icon_only' | 'icon_text' | 'text_only';

export interface ServiceItem {
  type: 'service';
  name: string;
  url: string;
  icon?: string;
}

export interface GroupItem {
  type: 'group';
  name: string;
  icon?: string;
  items: ServiceItem[];
}

export type Item = ServiceItem | GroupItem;

export interface NormalizedConfig {
  title?: string;
  displayMode?: DisplayMode;
  items: Item[];
}

export interface StoredState {
  rawYaml?: string;
  config?: NormalizedConfig;
  displayMode?: DisplayMode;
  schemaVersion?: 1;
}

export type ValidationResult =
  | { ok: true; config: NormalizedConfig }
  | { ok: false; errors: string[] };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(shared): add config types"
```

---

## Task 3: Schema validator

The validator must match PRD §11.3 error-message wording. It collects **all** errors rather than bailing on the first, so the options page can show the user everything wrong with their file in one pass.

**Files:**
- Create: `/Users/balubabu/projects/patch-panel/src/shared/schema.ts`

- [ ] **Step 1: Write `src/shared/schema.ts`**

```ts
import type {
  DisplayMode,
  GroupItem,
  Item,
  NormalizedConfig,
  ServiceItem,
  ValidationResult,
} from './types';

const DISPLAY_MODES: readonly DisplayMode[] = [
  'icon_only',
  'icon_text',
  'text_only',
];

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
  const displayName = isNonEmptyString(raw?.name)
    ? (raw.name as string)
    : '<unnamed>';
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

function validateGroup(raw: any, errors: string[]): GroupItem | null {
  const displayName = isNonEmptyString(raw?.name)
    ? (raw.name as string)
    : '<unnamed>';
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

  const children: ServiceItem[] = [];
  for (const childRaw of raw.items as unknown[]) {
    const childType = (childRaw as any)?.type;
    if (childType === 'group') {
      errors.push(
        `Group \`${displayName}\` contains an invalid child item (nested groups are not allowed)`,
      );
      continue;
    }
    if (childType !== 'service') {
      errors.push(
        `Group \`${displayName}\` contains an invalid child item (unknown type \`${String(childType)}\`)`,
      );
      continue;
    }
    const child = validateService(childRaw, errors);
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
    if (type === 'service') {
      const item = validateService(raw, errors);
      if (item) items.push(item);
    } else if (type === 'group') {
      const item = validateGroup(raw, errors);
      if (item) items.push(item);
    } else {
      errors.push(`Unknown item type \`${String(type)}\``);
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

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/schema.ts
git commit -m "feat(shared): add YAML config validator"
```

---

## Task 4: YAML parser

**Files:**
- Create: `/Users/balubabu/projects/patch-panel/src/shared/parse.ts`

- [ ] **Step 1: Write `src/shared/parse.ts`**

```ts
import yaml from 'js-yaml';
import { validate } from './schema';
import type { ValidationResult } from './types';

export function parseYaml(raw: string): ValidationResult {
  let doc: unknown;
  try {
    doc = yaml.load(raw);
  } catch {
    return { ok: false, errors: ['Invalid YAML syntax'] };
  }
  return validate(doc);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/parse.ts
git commit -m "feat(shared): add YAML parser"
```

---

## Task 5: Storage wrapper

**Files:**
- Create: `/Users/balubabu/projects/patch-panel/src/shared/storage.ts`

- [ ] **Step 1: Write `src/shared/storage.ts`**

```ts
import type { StoredState } from './types';

const KEYS: (keyof StoredState)[] = [
  'rawYaml',
  'config',
  'displayMode',
  'schemaVersion',
];

export async function getState(): Promise<StoredState> {
  const raw = await chrome.storage.local.get(KEYS as string[]);
  return raw as StoredState;
}

export async function setState(partial: Partial<StoredState>): Promise<void> {
  await chrome.storage.local.set(partial);
}

export function onStateChange(cb: (state: StoredState) => void): void {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== 'local') return;
    void getState().then(cb);
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/storage.ts
git commit -m "feat(shared): add chrome.storage wrapper"
```

---

## Task 6: Background service worker

**Files:**
- Create: `/Users/balubabu/projects/patch-panel/src/background/index.ts`

- [ ] **Step 1: Write `src/background/index.ts`**

```ts
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(background): open options on install and action click"
```

---

## Task 7: Options page — HTML and styles

**Files:**
- Create: `/Users/balubabu/projects/patch-panel/src/options/index.html`
- Create: `/Users/balubabu/projects/patch-panel/src/options/options.css`

- [ ] **Step 1: Write `src/options/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Patch Panel — Options</title>
    <link rel="stylesheet" href="./options.css" />
  </head>
  <body>
    <main>
      <header>
        <h1>Patch Panel</h1>
        <p class="subtitle">A YAML-driven bookmarks bar for homelab services.</p>
      </header>

      <section>
        <h2>Upload configuration</h2>
        <p class="hint">
          Select a YAML file to configure the bar. The file is parsed locally
          and never sent anywhere. See the README for the expected schema.
        </p>
        <input
          type="file"
          id="yaml-file"
          accept=".yaml,.yml,text/yaml,application/x-yaml"
        />
        <div id="status" role="status"></div>
      </section>

      <section>
        <h2>Display mode</h2>
        <p class="hint">Controls how items are rendered in the bar.</p>
        <div class="mode-group">
          <label><input type="radio" name="mode" value="icon_only" /> Icon only</label>
          <label><input type="radio" name="mode" value="icon_text" /> Icon + text</label>
          <label><input type="radio" name="mode" value="text_only" /> Text only</label>
        </div>
      </section>

      <section>
        <h2>Current configuration</h2>
        <pre id="current-yaml">No configuration uploaded yet.</pre>
      </section>
    </main>
    <script type="module" src="./index.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `src/options/options.css`**

```css
:root {
  color-scheme: light dark;
  --fg: #222;
  --fg-muted: #666;
  --bg: #fff;
  --bg-muted: #f4f4f4;
  --border: #d0d0d0;
  --accent: #0a7d2c;
  --error: #c8382f;
}

@media (prefers-color-scheme: dark) {
  :root {
    --fg: #eee;
    --fg-muted: #aaa;
    --bg: #1b1b1b;
    --bg-muted: #252525;
    --border: #333;
    --accent: #54d07a;
    --error: #ff6b63;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 2rem;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--fg);
  background: var(--bg);
}

main {
  max-width: 720px;
  margin: 0 auto;
}

header {
  margin-bottom: 2rem;
}

h1 {
  margin: 0 0 0.25rem 0;
  font-size: 1.75rem;
  font-weight: 600;
}

.subtitle {
  margin: 0;
  color: var(--fg-muted);
  font-size: 0.95rem;
}

section {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}

section:last-of-type { border-bottom: none; }

section h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
}

.hint {
  margin: 0 0 0.75rem 0;
  color: var(--fg-muted);
  font-size: 0.875rem;
  line-height: 1.4;
}

input[type='file'] {
  font-size: 0.875rem;
}

#status {
  margin-top: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.45;
  white-space: pre-wrap;
  min-height: 1.2em;
}

#status.success { color: var(--accent); }
#status.error { color: var(--error); }

.mode-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.mode-group label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
}

#current-yaml {
  background: var(--bg-muted);
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.8rem;
  line-height: 1.4;
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  margin: 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/options/index.html src/options/options.css
git commit -m "feat(options): add options page markup and styles"
```

---

## Task 8: Options page — TypeScript logic

**Files:**
- Create: `/Users/balubabu/projects/patch-panel/src/options/index.ts`

- [ ] **Step 1: Write `src/options/index.ts`**

```ts
import { parseYaml } from '../shared/parse';
import { getState, setState } from '../shared/storage';
import type { DisplayMode } from '../shared/types';

const fileInput = document.getElementById('yaml-file') as HTMLInputElement;
const status = document.getElementById('status') as HTMLDivElement;
const currentYaml = document.getElementById('current-yaml') as HTMLPreElement;
const modeRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]'),
);

function setStatus(kind: 'success' | 'error' | 'none', message: string) {
  status.className = kind === 'none' ? '' : kind;
  status.textContent = message;
}

async function render() {
  const state = await getState();
  currentYaml.textContent =
    state.rawYaml && state.rawYaml.length > 0
      ? state.rawYaml
      : 'No configuration uploaded yet.';
  const mode: DisplayMode = state.displayMode ?? 'icon_text';
  for (const r of modeRadios) {
    r.checked = r.value === mode;
  }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const raw = await file.text();
  const result = parseYaml(raw);
  if (!result.ok) {
    setStatus('error', result.errors.map((e) => `• ${e}`).join('\n'));
    return;
  }
  const current = await getState();
  const displayMode: DisplayMode =
    result.config.displayMode ?? current.displayMode ?? 'icon_text';
  await setState({
    rawYaml: raw,
    config: result.config,
    displayMode,
    schemaVersion: 1,
  });
  setStatus('success', 'Configuration saved.');
  fileInput.value = '';
  await render();
});

for (const r of modeRadios) {
  r.addEventListener('change', async () => {
    if (!r.checked) return;
    await setState({ displayMode: r.value as DisplayMode });
  });
}

void render();
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: `dist/` created with `manifest.json`, `src/background/index.js`, `src/options/index.html`, etc. Exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/options/index.ts
git commit -m "feat(options): add upload, validation, and display-mode controls"
```

---

## Task 9: Content script — bar scaffolding and service items

This task puts a working (services-only) bar on every page. Groups come in Task 10.

**Files:**
- Create: `/Users/balubabu/projects/patch-panel/src/content/bar.css`
- Create: `/Users/balubabu/projects/patch-panel/src/content/item.ts`
- Create: `/Users/balubabu/projects/patch-panel/src/content/bar.ts`
- Create: `/Users/balubabu/projects/patch-panel/src/content/index.ts`

- [ ] **Step 1: Write `src/content/bar.css`**

```css
:host {
  all: initial;
}

.bar {
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 100%;
  padding: 0 8px;
  background: #ececec;
  border-bottom: 1px solid #bdbdbd;
  color: #222;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 12px;
  gap: 2px;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: thin;
}

.bar::-webkit-scrollbar { height: 4px; }
.bar::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.15); border-radius: 2px; }

.item {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 100%;
  text-decoration: none;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
  white-space: nowrap;
  max-width: 200px;
  font: inherit;
  flex-shrink: 0;
  user-select: none;
}

.item:hover {
  background: rgba(0, 0, 0, 0.08);
}

.item:focus-visible {
  outline: 2px solid #4a9eff;
  outline-offset: -2px;
}

.icon {
  width: 16px;
  height: 16px;
  display: inline-block;
  flex-shrink: 0;
  border-radius: 3px;
  object-fit: contain;
}

.icon.fallback {
  background: #8a8a8a;
  color: white;
  text-align: center;
  font-weight: 600;
  line-height: 16px;
  font-size: 10px;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.bar[data-mode='icon_only'] .label { display: none; }
.bar[data-mode='icon_only'] .item { max-width: none; }
.bar[data-mode='text_only'] .icon { display: none; }

@media (prefers-color-scheme: dark) {
  .bar { background: #2a2a2a; border-bottom-color: #1a1a1a; color: #eee; }
  .item:hover { background: rgba(255, 255, 255, 0.08); }
  .icon.fallback { background: #555; }
}
```

- [ ] **Step 2: Write `src/content/item.ts`**

```ts
import type { ServiceItem } from '../shared/types';

interface IconSource {
  name: string;
  icon?: string;
}

export function renderIcon(source: IconSource): HTMLElement {
  if (source.icon) {
    const img = document.createElement('img');
    img.className = 'icon';
    img.src = source.icon;
    img.alt = '';
    img.onerror = () => {
      img.replaceWith(fallbackIcon(source.name));
    };
    return img;
  }
  return fallbackIcon(source.name);
}

export function fallbackIcon(name: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'icon fallback';
  const trimmed = name.trim();
  span.textContent = (trimmed.length > 0 ? trimmed[0] : '?').toUpperCase();
  return span;
}

export function renderServiceItem(s: ServiceItem): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'item';
  a.href = s.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = s.name;

  a.appendChild(renderIcon(s));

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = s.name;
  a.appendChild(label);

  return a;
}
```

- [ ] **Step 3: Write `src/content/bar.ts`**

```ts
import type { DisplayMode, NormalizedConfig } from '../shared/types';
import { renderServiceItem } from './item';
import barCss from './bar.css?inline';

const HOST_ID = 'patch-panel-host';
const BAR_HEIGHT_PX = 30;

function applyHostStyles(host: HTMLElement) {
  host.setAttribute(
    'style',
    [
      'all: initial',
      'position: fixed !important',
      'top: 0 !important',
      'left: 0 !important',
      'right: 0 !important',
      `height: ${BAR_HEIGHT_PX}px !important`,
      'z-index: 2147483647 !important',
      'pointer-events: auto !important',
      'display: block !important',
    ].join('; '),
  );
}

function getOrCreateHost(): { host: HTMLElement; shadow: ShadowRoot } {
  const existing = document.getElementById(HOST_ID);
  if (existing && existing.shadowRoot) {
    applyHostStyles(existing);
    return { host: existing, shadow: existing.shadowRoot };
  }
  const host = document.createElement('div');
  host.id = HOST_ID;
  applyHostStyles(host);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);
  return { host, shadow };
}

export function renderBar(config: NormalizedConfig, mode: DisplayMode) {
  const { shadow } = getOrCreateHost();
  shadow.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = barCss;
  shadow.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.dataset.mode = mode;

  for (const item of config.items) {
    if (item.type === 'service') {
      bar.appendChild(renderServiceItem(item));
    } else {
      // Group rendering lands in Task 10. Skip for now so Task 9 is testable on its own.
      continue;
    }
  }

  shadow.appendChild(bar);
}

export function unmountBar() {
  const host = document.getElementById(HOST_ID);
  if (host) host.remove();
}
```

- [ ] **Step 4: Write `src/content/index.ts`**

```ts
import { getState, onStateChange } from '../shared/storage';
import type { StoredState } from '../shared/types';
import { renderBar, unmountBar } from './bar';

function apply(state: StoredState) {
  if (state.config && state.config.items.length > 0) {
    renderBar(state.config, state.displayMode ?? 'icon_text');
  } else {
    unmountBar();
  }
}

async function init() {
  const state = await getState();
  apply(state);
  onStateChange(apply);
}

void init();
```

- [ ] **Step 5: Build and manually verify**

Run: `npm run build`
Expected: clean build, exit 0.

Then in Chrome:
1. Open `chrome://extensions`, enable Developer mode, click "Load unpacked", select `/Users/balubabu/projects/patch-panel/dist`.
2. Chrome should auto-open the options page. Save this YAML to `/tmp/patch-panel-test.yaml`:

   ```yaml
   title: My Homelab
   displayMode: icon_text
   items:
     - type: service
       name: Proxmox
       url: https://proxmox.local
     - type: service
       name: Grafana
       url: https://grafana.local
   ```

3. Upload it. Status should say "Configuration saved." The "Current configuration" block should show the YAML.
4. Open a new tab to any https site (e.g. `https://example.com`). The Patch Panel bar should appear at the very top with two service items. Click one — it should open in a new tab.

Expected: bar renders, items clickable, no console errors from the extension.

- [ ] **Step 6: Commit**

```bash
git add src/content/bar.css src/content/item.ts src/content/bar.ts src/content/index.ts
git commit -m "feat(content): inject shadow-DOM bar with service items"
```

---

## Task 10: Groups and hover dropdowns

**Files:**
- Modify: `/Users/balubabu/projects/patch-panel/src/content/bar.css`
- Create: `/Users/balubabu/projects/patch-panel/src/content/dropdown.ts`
- Create: `/Users/balubabu/projects/patch-panel/src/content/group.ts`
- Modify: `/Users/balubabu/projects/patch-panel/src/content/bar.ts`

- [ ] **Step 1: Add dropdown styles to `src/content/bar.css`**

Append this to the end of the existing file:

```css
.group {
  position: relative;
}

.caret {
  margin-left: 2px;
  opacity: 0.6;
  font-size: 9px;
}

.bar[data-mode='icon_only'] .caret { display: none; }

.dropdown {
  position: fixed;
  top: 30px;
  left: 0;
  min-width: 180px;
  max-width: 320px;
  max-height: 70vh;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #bdbdbd;
  border-top: none;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
  display: none;
  flex-direction: column;
  z-index: 1;
}

.dropdown.open { display: flex; }

.dropdown .item {
  max-width: none;
  height: 30px;
  padding: 0 12px;
}

@media (prefers-color-scheme: dark) {
  .dropdown {
    background: #2a2a2a;
    border-color: #1a1a1a;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  }
}
```

- [ ] **Step 2: Write `src/content/dropdown.ts`**

```ts
const CLOSE_DELAY_MS = 150;

let openDropdown: HTMLElement | null = null;
let openAnchor: HTMLElement | null = null;
let closeTimer: number | null = null;
let globalHandlersRegistered = false;
let activeShadow: ShadowRoot | null = null;

function cancelClose() {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function scheduleClose() {
  cancelClose();
  closeTimer = window.setTimeout(() => {
    closeAll();
  }, CLOSE_DELAY_MS);
}

export function closeAll() {
  cancelClose();
  if (openDropdown) {
    openDropdown.classList.remove('open');
    openDropdown = null;
    openAnchor = null;
  }
}

function registerGlobalHandlers() {
  if (globalHandlersRegistered) return;
  globalHandlersRegistered = true;

  window.addEventListener('scroll', closeAll, { passive: true, capture: true });
  window.addEventListener('resize', closeAll);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
  document.addEventListener(
    'click',
    (e) => {
      if (!openDropdown || !activeShadow) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (!activeShadow.host.contains(target)) closeAll();
    },
    true,
  );
}

export function attachDropdown(
  anchor: HTMLElement,
  panel: HTMLElement,
  shadow: ShadowRoot,
) {
  activeShadow = shadow;
  registerGlobalHandlers();
  shadow.appendChild(panel);

  const open = () => {
    cancelClose();
    if (openDropdown && openDropdown !== panel) {
      openDropdown.classList.remove('open');
    }
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const panelWidth = panel.offsetWidth || 200;
    const left = Math.min(rect.left, viewportWidth - panelWidth - 4);
    panel.style.left = `${Math.max(0, left)}px`;
    panel.classList.add('open');
    openDropdown = panel;
    openAnchor = anchor;
  };

  anchor.addEventListener('mouseenter', open);
  anchor.addEventListener('focus', open);
  anchor.addEventListener('mouseleave', scheduleClose);
  panel.addEventListener('mouseenter', cancelClose);
  panel.addEventListener('mouseleave', scheduleClose);
  panel.addEventListener('click', () => {
    // Clicking a service link inside the dropdown opens a new tab; close the
    // dropdown in this tab immediately so it does not linger.
    closeAll();
  });

  anchor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (openAnchor === anchor) closeAll();
      else open();
    }
  });
}
```

- [ ] **Step 3: Write `src/content/group.ts`**

```ts
import type { GroupItem } from '../shared/types';
import { renderIcon, renderServiceItem } from './item';
import { attachDropdown } from './dropdown';

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
    dropdown.appendChild(renderServiceItem(child));
  }

  attachDropdown(btn, dropdown, shadow);

  return btn;
}
```

- [ ] **Step 4: Update `src/content/bar.ts` to render groups and reset state on re-render**

Replace the entire file with:

```ts
import type { DisplayMode, NormalizedConfig } from '../shared/types';
import { renderServiceItem } from './item';
import { renderGroupItem } from './group';
import { closeAll as closeAllDropdowns } from './dropdown';
import barCss from './bar.css?inline';

const HOST_ID = 'patch-panel-host';
const BAR_HEIGHT_PX = 30;

function applyHostStyles(host: HTMLElement) {
  host.setAttribute(
    'style',
    [
      'all: initial',
      'position: fixed !important',
      'top: 0 !important',
      'left: 0 !important',
      'right: 0 !important',
      `height: ${BAR_HEIGHT_PX}px !important`,
      'z-index: 2147483647 !important',
      'pointer-events: auto !important',
      'display: block !important',
    ].join('; '),
  );
}

function getOrCreateHost(): { host: HTMLElement; shadow: ShadowRoot } {
  const existing = document.getElementById(HOST_ID);
  if (existing && existing.shadowRoot) {
    applyHostStyles(existing);
    return { host: existing, shadow: existing.shadowRoot };
  }
  const host = document.createElement('div');
  host.id = HOST_ID;
  applyHostStyles(host);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);
  return { host, shadow };
}

export function renderBar(config: NormalizedConfig, mode: DisplayMode) {
  closeAllDropdowns();

  const { shadow } = getOrCreateHost();
  shadow.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = barCss;
  shadow.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.dataset.mode = mode;

  for (const item of config.items) {
    if (item.type === 'service') {
      bar.appendChild(renderServiceItem(item));
    } else {
      bar.appendChild(renderGroupItem(item, shadow));
    }
  }

  shadow.appendChild(bar);
}

export function unmountBar() {
  closeAllDropdowns();
  const host = document.getElementById(HOST_ID);
  if (host) host.remove();
}
```

- [ ] **Step 5: Build and manually verify**

Run: `npm run build`
Expected: clean build.

Reload the extension in `chrome://extensions` (click the refresh icon on the Patch Panel card). Open the options page and upload this YAML (from PRD §12.1):

```yaml
title: My Homelab
displayMode: icon_text

items:
  - type: service
    name: Proxmox
    url: https://proxmox.local

  - type: service
    name: Grafana
    url: https://grafana.local

  - type: group
    name: Monitoring
    items:
      - type: service
        name: Uptime Kuma
        url: https://kuma.local

      - type: service
        name: Prometheus
        url: https://prometheus.local

      - type: service
        name: Loki
        url: https://loki.local
```

Visit `https://example.com` in a new tab. Verify:

- Bar shows Proxmox, Grafana, Monitoring (with caret).
- Hovering Monitoring opens a dropdown with Uptime Kuma, Prometheus, Loki.
- Moving the cursor from Monitoring down into the dropdown does not close it (no dead zone).
- Leaving both closes the dropdown after ~150 ms.
- Pressing Escape while a dropdown is open closes it.
- Scrolling the page closes an open dropdown.
- Clicking a dropdown service opens it in a new tab; the dropdown closes on the source tab.
- Clicking elsewhere on the page closes an open dropdown.

- [ ] **Step 6: Commit**

```bash
git add src/content/bar.css src/content/dropdown.ts src/content/group.ts src/content/bar.ts
git commit -m "feat(content): add group items with hover dropdowns"
```

---

## Task 11: Validate display-mode switching and invalid-YAML handling

No new code — this task is a verification gate for behaviours already wired up in Tasks 8–10. If any step fails, fix inline and loop back.

- [ ] **Step 1: Display-mode switching**

1. Reload the extension and open the options page.
2. With the PRD fixture loaded, flip the radio to "Icon only". Visit `https://example.com`. Only icons render; caret is hidden; tooltip on hover still shows full names.
3. Flip to "Text only". Icons hidden; labels render.
4. Flip back to "Icon + text". Both render.
5. Close Chrome completely, reopen, visit `https://example.com`. The mode that was last selected is still active.

Expected: all three modes render correctly, and selection persists across a full Chrome restart.

- [ ] **Step 2: Invalid YAML preserves prior config**

1. Save this YAML to `/tmp/patch-panel-broken.yaml`:

   ```yaml
   title: Broken
   items:
     - type: service
       name: No URL Here
   ```

2. Upload it via the options page.

Expected: status shows the error `• Service \`No URL Here\` is missing \`url\``. "Current configuration" still shows the previous valid YAML. Visit `https://example.com` — bar is unchanged.

- [ ] **Step 3: Malformed YAML syntax**

1. Save this to `/tmp/patch-panel-garbage.yaml`:

   ```
   : : : not valid : yaml
   items: [unterminated
   ```

2. Upload it.

Expected: status shows `• Invalid YAML syntax`. Previous config untouched.

- [ ] **Step 4: Nested group rejected**

1. Upload this YAML:

   ```yaml
   items:
     - type: group
       name: Outer
       items:
         - type: group
           name: Inner
           items:
             - type: service
               name: X
               url: https://x.local
   ```

Expected: status shows an error containing `Group \`Outer\` contains an invalid child item (nested groups are not allowed)`. Previous config untouched.

- [ ] **Step 5: Persistence across Chrome restart**

1. Quit Chrome fully. Reopen. Visit `https://example.com`.

Expected: bar renders with the last valid config and display mode. No re-upload needed.

- [ ] **Step 6: Missing-icon fallback**

1. Upload this YAML:

   ```yaml
   items:
     - type: service
       name: NoIconService
       url: https://example.com
     - type: service
       name: BrokenIcon
       url: https://example.com
       icon: https://definitely-not-a-real-host.invalid/missing.png
   ```

Expected: both items render. `NoIconService` shows an "N" fallback tile. `BrokenIcon` initially attempts the `<img>`, then replaces with a "B" fallback after the load error.

- [ ] **Step 7: Commit (if any fixes were needed)**

If you had to make code changes to fix any of the above, stage and commit them:

```bash
git add -A
git commit -m "fix(content): <describe the fix>"
```

Otherwise skip — no-op tasks don't need a commit.

---

## Task 12: Acceptance criteria smoke test

Walk through each line of PRD §18 (Acceptance Criteria) and PRD §19 (Success Criteria) against the loaded extension. This is a final gate before declaring V1 done.

- [ ] **Step 1: Run through PRD §18**

Check each item:

- [ ] user can upload a YAML file — yes, via options page
- [ ] YAML is parsed client-side — yes, `parseYaml` runs in the options page
- [ ] valid YAML is stored locally — yes, `chrome.storage.local`
- [ ] invalid YAML shows a clear error — yes (verified in Task 11)
- [ ] previous valid config is preserved if validation fails — yes (verified in Task 11)
- [ ] top bar renders on supported webpages — yes
- [ ] top-level services render correctly — yes
- [ ] top-level groups render correctly — yes
- [ ] group hover opens dropdown — yes
- [ ] grouped child services are clickable — yes, open in new tab
- [ ] icon-only mode works — yes (verified in Task 11)
- [ ] icon + text mode works — yes
- [ ] text-only mode works — yes
- [ ] selected mode persists across browser restarts — yes (verified in Task 11)
- [ ] all service clicks open configured URLs in new tabs — yes (`target="_blank"`)
- [ ] bar state persists after browser restart — yes

- [ ] **Step 2: Confirm PRD §19 — a user can complete the full flow**

1. Install (load unpacked) — ✓ already done
2. Upload YAML — ✓
3. Choose a display mode — ✓
4. See services in the top bar — ✓
5. Click services to open them in new tabs — ✓
6. Hover over groups to access child services — ✓
7. Restart Chrome and still have everything working — ✓

- [ ] **Step 3: Production build sanity check**

```bash
npm run build
ls -la dist/
```

Expected: `dist/manifest.json`, `dist/assets/`, `dist/src/options/index.html`, content and background script bundles all present. No warnings about missing entries.

- [ ] **Step 4: Tag v0.1.0**

```bash
git tag v0.1.0
```

If everything above checks out, Patch Panel V1 is complete.
