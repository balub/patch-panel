import { parseYaml } from '../shared/parse';
import { getState, setState } from '../shared/storage';
import type { DisplayMode } from '../shared/types';
import {
  BAR_HEIGHT_DEFAULT,
  BAR_HEIGHT_MAX,
  BAR_HEIGHT_MIN,
} from '../shared/types';
import mockYaml from '../../examples/homelab.yaml?raw';

const fileInput = document.getElementById('yaml-file') as HTMLInputElement;
const status = document.getElementById('status') as HTMLDivElement;
const currentYaml = document.getElementById('current-yaml') as HTMLPreElement;
const modeRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]'),
);
const downloadButton = document.getElementById(
  'download-mock',
) as HTMLButtonElement;
const heightInput = document.getElementById('bar-height') as HTMLInputElement;
const heightValue = document.getElementById(
  'bar-height-value',
) as HTMLSpanElement;
const autoHideInput = document.getElementById('auto-hide') as HTMLInputElement;

function setStatus(kind: 'success' | 'error' | 'none', message: string) {
  status.className = kind === 'none' ? '' : kind;
  status.textContent = message;
}

function clampHeight(n: number): number {
  if (!Number.isFinite(n)) return BAR_HEIGHT_DEFAULT;
  return Math.min(BAR_HEIGHT_MAX, Math.max(BAR_HEIGHT_MIN, Math.round(n)));
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

  const height = clampHeight(state.barHeight ?? BAR_HEIGHT_DEFAULT);
  heightInput.value = String(height);
  heightValue.textContent = `${height} px`;

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

heightInput.addEventListener('input', () => {
  const next = clampHeight(Number(heightInput.value));
  heightValue.textContent = `${next} px`;
});

heightInput.addEventListener('change', async () => {
  const next = clampHeight(Number(heightInput.value));
  heightInput.value = String(next);
  heightValue.textContent = `${next} px`;
  await setState({ barHeight: next });
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
