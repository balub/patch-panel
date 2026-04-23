import type { BarPosition } from '../shared/types';

const CLOSE_DELAY_MS = 150;

let openDropdown: HTMLElement | null = null;
let openAnchor: HTMLElement | null = null;
let closeTimer: number | null = null;
let globalHandlersRegistered = false;
let activeShadow: ShadowRoot | null = null;

interface BarContext {
  position: BarPosition;
  barHeight: number;
  barWidth: number;
}

let barContext: BarContext = {
  position: 'top',
  barHeight: 30,
  barWidth: 180,
};

export function setBarContext(ctx: BarContext) {
  barContext = ctx;
}

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
  }
  if (openAnchor) {
    openAnchor.setAttribute('aria-expanded', 'false');
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

function positionPanel(anchor: HTMLElement, panel: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const panelWidth = panel.offsetWidth || 220;
  const panelHeight = panel.offsetHeight || 0;

  panel.dataset.position = barContext.position;

  if (barContext.position === 'top') {
    const left = Math.min(rect.left, vw - panelWidth - 4);
    panel.style.top = '';
    panel.style.left = `${Math.max(0, left)}px`;
    return;
  }

  const top = Math.max(
    4,
    Math.min(rect.top, vh - panelHeight - 4),
  );
  panel.style.top = `${top}px`;

  if (barContext.position === 'left') {
    panel.style.left = `${barContext.barWidth}px`;
  } else {
    panel.style.left = `${Math.max(0, vw - barContext.barWidth - panelWidth)}px`;
  }
}

export function attachDropdown(
  anchor: HTMLElement,
  panel: HTMLElement,
  shadow: ShadowRoot,
) {
  activeShadow = shadow;
  registerGlobalHandlers();
  shadow.appendChild(panel);

  anchor.setAttribute('aria-expanded', 'false');
  anchor.setAttribute('aria-haspopup', 'menu');

  const open = () => {
    cancelClose();
    if (openDropdown && openDropdown !== panel) {
      openDropdown.classList.remove('open');
    }
    if (openAnchor && openAnchor !== anchor) {
      openAnchor.setAttribute('aria-expanded', 'false');
    }
    positionPanel(anchor, panel);
    panel.classList.add('open');
    anchor.setAttribute('aria-expanded', 'true');
    openDropdown = panel;
    openAnchor = anchor;
  };

  anchor.addEventListener('mouseenter', open);
  anchor.addEventListener('focus', open);
  anchor.addEventListener('mouseleave', scheduleClose);
  panel.addEventListener('mouseenter', cancelClose);
  panel.addEventListener('mouseleave', scheduleClose);
  panel.addEventListener('click', () => {
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
