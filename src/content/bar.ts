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
