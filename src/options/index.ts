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
