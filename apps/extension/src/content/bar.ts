import type { BarPosition, DisplayMode, NormalizedConfig } from '../shared/types';
import { BAR_HEIGHT_DEFAULT, BAR_WIDTH_DEFAULT } from '../shared/types';
import { renderServiceItem } from './item';
import { renderGroupItem } from './group';
import { renderMonitorValue, handleMonitorLatestChange } from './monitor-value';
import { renderMonitorGraph, handleMonitorReadingsChange } from './monitor-graph';
import { isMonitorLatestKey, isMonitorReadingsKey } from '../shared/monitor-storage';
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
    try {
      void chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    } catch {
      // Extension context invalidated after reload — nothing to do until page refreshes.
    }
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
