import type { StoredState } from './types';

const KEYS: (keyof StoredState)[] = [
  'rawYaml',
  'config',
  'displayMode',
  'barPosition',
  'barHeight',
  'barWidth',
  'autoHide',
  'schemaVersion',
];

const CONFIG_KEY_SET = new Set<string>(KEYS);

export async function getState(): Promise<StoredState> {
  const raw = await chrome.storage.local.get(KEYS as string[]);
  return raw as StoredState;
}

export async function setState(partial: Partial<StoredState>): Promise<void> {
  await chrome.storage.local.set(partial);
}

export function onStateChange(cb: (state: StoredState) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!Object.keys(changes).some((k) => CONFIG_KEY_SET.has(k))) return;
    void getState().then(cb);
  });
}
