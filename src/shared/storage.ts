import type { StoredState } from './types';

const KEYS: (keyof StoredState)[] = [
  'rawYaml',
  'config',
  'displayMode',
  'barHeight',
  'autoHide',
  'schemaVersion',
];

export async function getState(): Promise<StoredState> {
  const raw = await chrome.storage.local.get(KEYS as string[]);
  return raw as StoredState;
}

export async function setState(partial: Partial<StoredState>): Promise<void> {
  await chrome.storage.local.set(partial);
}

export function onStateChange(cb: (state: StoredState) => void): void {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== 'local') return;
    void getState().then(cb);
  });
}
