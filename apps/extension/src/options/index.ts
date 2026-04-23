import { parseYaml } from '../shared/parse';
import { getState, setState } from '../shared/storage';
import type { BarPosition, DisplayMode } from '../shared/types';
import {
  BAR_HEIGHT_DEFAULT,
  BAR_HEIGHT_MAX,
  BAR_HEIGHT_MIN,
  BAR_POSITION_DEFAULT,
  BAR_WIDTH_DEFAULT,
  BAR_WIDTH_MAX,
  BAR_WIDTH_MIN,
  isVertical,
} from '../shared/types';
import mockYaml from '../../examples/homelab.yaml?raw';

const fileInput = document.getElementById('yaml-file') as HTMLInputElement;
const status = document.getElementById('status') as HTMLDivElement;
const currentYaml = document.getElementById('current-yaml') as HTMLPreElement;
const modeRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]'),
);
const positionRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="position"]'),
);
const downloadButton = document.getElementById(
  'download-mock',
) as HTMLButtonElement;
const thicknessInput = document.getElementById(
  'bar-thickness',
) as HTMLInputElement;
const thicknessValue = document.getElementById(
  'bar-thickness-value',
) as HTMLSpanElement;
const thicknessLabel = document.getElementById(
  'bar-thickness-label',
) as HTMLLabelElement;
const thicknessHint = document.getElementById(
  'bar-thickness-hint',
) as HTMLParagraphElement;
const autoHideInput = document.getElementById('auto-hide') as HTMLInputElement;
const autoHideHint = document.getElementById(
  'auto-hide-hint',
) as HTMLParagraphElement;

function setStatus(kind: 'success' | 'error' | 'none', message: string) {
  status.className = kind === 'none' ? '' : kind;
  status.textContent = message;
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampHeight(n: number): number {
  return clamp(n, BAR_HEIGHT_MIN, BAR_HEIGHT_MAX, BAR_HEIGHT_DEFAULT);
}

function clampWidth(n: number): number {
  return clamp(n, BAR_WIDTH_MIN, BAR_WIDTH_MAX, BAR_WIDTH_DEFAULT);
}

function syncThicknessControl(
  position: BarPosition,
  barHeight: number,
  barWidth: number,
) {
  const vertical = isVertical(position);
  const value = vertical ? barWidth : barHeight;
  const min = vertical ? BAR_WIDTH_MIN : BAR_HEIGHT_MIN;
  const max = vertical ? BAR_WIDTH_MAX : BAR_HEIGHT_MAX;

  thicknessInput.min = String(min);
  thicknessInput.max = String(max);
  thicknessInput.value = String(value);
  thicknessValue.textContent = `${value} px`;
  thicknessLabel.textContent = vertical ? 'Bar width' : 'Bar height';
  thicknessHint.textContent = vertical
    ? `Between ${min} and ${max} pixels. Dropdowns align automatically.`
    : `Between ${min} and ${max} pixels. Dropdowns align automatically.`;

  autoHideHint.textContent = vertical
    ? position === 'left'
      ? 'Hide the bar off-screen until the cursor nears the left edge.'
      : 'Hide the bar off-screen until the cursor nears the right edge.'
    : 'Hide the bar off-screen until the cursor nears the top edge.';
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

  const position: BarPosition = state.barPosition ?? BAR_POSITION_DEFAULT;
  for (const r of positionRadios) {
    r.checked = r.value === position;
  }

  const height = clampHeight(state.barHeight ?? BAR_HEIGHT_DEFAULT);
  const width = clampWidth(state.barWidth ?? BAR_WIDTH_DEFAULT);
  syncThicknessControl(position, height, width);

  autoHideInput.checked = Boolean(state.autoHide);
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

for (const r of positionRadios) {
  r.addEventListener('change', async () => {
    if (!r.checked) return;
    await setState({ barPosition: r.value as BarPosition });
    await render();
  });
}

function currentPosition(): BarPosition {
  const checked = positionRadios.find((r) => r.checked);
  return (checked?.value as BarPosition) ?? BAR_POSITION_DEFAULT;
}

thicknessInput.addEventListener('input', () => {
  const vertical = isVertical(currentPosition());
  const next = vertical
    ? clampWidth(Number(thicknessInput.value))
    : clampHeight(Number(thicknessInput.value));
  thicknessValue.textContent = `${next} px`;
});

thicknessInput.addEventListener('change', async () => {
  const vertical = isVertical(currentPosition());
  const next = vertical
    ? clampWidth(Number(thicknessInput.value))
    : clampHeight(Number(thicknessInput.value));
  thicknessInput.value = String(next);
  thicknessValue.textContent = `${next} px`;
  await setState(vertical ? { barWidth: next } : { barHeight: next });
});

autoHideInput.addEventListener('change', async () => {
  await setState({ autoHide: autoHideInput.checked });
});

downloadButton.addEventListener('click', () => {
  const blob = new Blob([mockYaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'patch-panel.yaml';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

void render();
