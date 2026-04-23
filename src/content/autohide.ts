const TRIGGER_ZONE_PX = 5;
const EXIT_BUFFER_PX = 40;
const HIDE_DELAY_MS = 300;

let enabled = false;
let hostEl: HTMLElement | null = null;
let barHeightPx = 30;
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

function setHidden(hidden: boolean) {
  if (!hostEl) return;
  if (hidden) {
    hostEl.style.setProperty('transform', 'translateY(-100%)', 'important');
  } else {
    hostEl.style.setProperty('transform', 'none', 'important');
  }
}

function onMouseMove(e: MouseEvent) {
  if (!enabled || !hostEl) return;
  const exitZone = barHeightPx + EXIT_BUFFER_PX;
  const overHost = e.target === hostEl;
  if (e.clientY <= TRIGGER_ZONE_PX || overHost) {
    cancelHide();
    setHidden(false);
  } else if (e.clientY > exitZone) {
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
  opts: { enabled: boolean; barHeight: number },
) {
  hostEl = host;
  enabled = opts.enabled;
  barHeightPx = opts.barHeight;
  installListeners();
  cancelHide();
  setHidden(enabled);
}
