import type { DisplayMode, NormalizedConfig } from '../shared/types';
import { BAR_HEIGHT_DEFAULT } from '../shared/types';
import { renderServiceItem } from './item';
import { renderGroupItem } from './group';
import { closeAll as closeAllDropdowns } from './dropdown';
import { configureAutoHide } from './autohide';
import barCss from './bar.css?inline';

const HOST_ID = 'patch-panel-host';

export interface BarOptions {
  config: NormalizedConfig;
  mode: DisplayMode;
  barHeight: number;
  autoHide: boolean;
}

function applyHostStyles(host: HTMLElement, heightPx: number) {
  host.setAttribute(
    'style',
    [
      'all: initial',
      'position: fixed !important',
      'top: 0 !important',
      'left: 0 !important',
      'right: 0 !important',
      `height: ${heightPx}px !important`,
      'z-index: 2147483647 !important',
      'pointer-events: auto !important',
      'display: block !important',
      'transition: transform 0.15s ease-out !important',
      `--bar-height: ${heightPx}px`,
    ].join('; '),
  );
}

function getOrCreateHost(heightPx: number): {
  host: HTMLElement;
  shadow: ShadowRoot;
} {
  const existing = document.getElementById(HOST_ID);
  if (existing && existing.shadowRoot) {
    applyHostStyles(existing, heightPx);
    return { host: existing, shadow: existing.shadowRoot };
  }
  const host = document.createElement('div');
  host.id = HOST_ID;
  applyHostStyles(host, heightPx);
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

export function renderBar(opts: BarOptions) {
  closeAllDropdowns();

  const heightPx = opts.barHeight || BAR_HEIGHT_DEFAULT;
  const { host, shadow } = getOrCreateHost(heightPx);
  shadow.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = barCss;
  shadow.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.dataset.mode = opts.mode;

  for (const item of opts.config.items) {
    if (item.type === 'service') {
      bar.appendChild(renderServiceItem(item));
    } else {
      bar.appendChild(renderGroupItem(item, shadow));
    }
  }

  bar.appendChild(renderCogButton());

  shadow.appendChild(bar);

  configureAutoHide(host, { enabled: opts.autoHide, barHeight: heightPx });
}

export function unmountBar() {
  closeAllDropdowns();
  const host = document.getElementById(HOST_ID);
  if (host) host.remove();
}
