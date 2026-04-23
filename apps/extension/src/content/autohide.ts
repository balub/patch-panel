import type { BarPosition } from '../shared/types';

const TRIGGER_ZONE_PX = 5;
const EXIT_BUFFER_PX = 40;
const HIDE_DELAY_MS = 300;

let enabled = false;
let hostEl: HTMLElement | null = null;
let position: BarPosition = 'top';
let barThicknessPx = 30;
let hideTimer: number | null = null;
let listenersInstalled = false;

function cancelHide() {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleHide() {
  cancelHide();
  hideTimer = window.setTimeout(() => setHidden(true), HIDE_DELAY_MS);
}

function hiddenTransform(): string {
  switch (position) {
    case 'left':
      return 'translateX(-100%)';
    case 'right':
      return 'translateX(100%)';
    case 'top':
    default:
      return 'translateY(-100%)';
  }
}

function setHidden(hidden: boolean) {
  if (!hostEl) return;
  if (hidden) {
    hostEl.style.setProperty('transform', hiddenTransform(), 'important');
  } else {
    hostEl.style.setProperty('transform', 'none', 'important');
  }
}

function onMouseMove(e: MouseEvent) {
  if (!enabled || !hostEl) return;
  const overHost = e.target === hostEl;
  const exitZone = barThicknessPx + EXIT_BUFFER_PX;
  const vw = window.innerWidth;

  let nearEdge = false;
  let pastExit = false;

  if (position === 'top') {
    nearEdge = e.clientY <= TRIGGER_ZONE_PX;
    pastExit = e.clientY > exitZone;
  } else if (position === 'left') {
    nearEdge = e.clientX <= TRIGGER_ZONE_PX;
    pastExit = e.clientX > exitZone;
  } else {
    nearEdge = e.clientX >= vw - TRIGGER_ZONE_PX;
    pastExit = e.clientX < vw - exitZone;
  }

  if (nearEdge || overHost) {
    cancelHide();
    setHidden(false);
  } else if (pastExit) {
    scheduleHide();
  }
}

function onMouseLeaveDocument() {
  if (!enabled) return;
  scheduleHide();
}

function installListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mouseleave', onMouseLeaveDocument);
}

export function configureAutoHide(
  host: HTMLElement,
  opts: {
    enabled: boolean;
    position: BarPosition;
    barHeight: number;
    barWidth: number;
  },
) {
  hostEl = host;
  enabled = opts.enabled;
  position = opts.position;
  barThicknessPx = position === 'top' ? opts.barHeight : opts.barWidth;
  installListeners();
  cancelHide();
  setHidden(enabled);
}
