import type { MetricSnapshot } from '../adapters/types';

const PREFIX = 'pp:monitor:';
export const DEFAULT_HISTORY = 20;

const latestKey = (url: string) => `${PREFIX}${url}:latest`;
const readingsKey = (url: string) => `${PREFIX}${url}:readings`;

export async function pushSnapshot(
  url: string,
  snap: MetricSnapshot,
  cap = DEFAULT_HISTORY,
): Promise<void> {
  const rKey = readingsKey(url);
  const lKey = latestKey(url);
  const stored = await chrome.storage.local.get(rKey);
  const existing = (stored[rKey] as MetricSnapshot[] | undefined) ?? [];
  const trimmed = [...existing, snap].slice(-cap);
  await chrome.storage.local.set({ [lKey]: snap, [rKey]: trimmed });
}

export async function getLatest(
  url: string,
): Promise<MetricSnapshot | undefined> {
  const result = await chrome.storage.local.get(latestKey(url));
  return result[latestKey(url)] as MetricSnapshot | undefined;
}

export async function getReadings(url: string): Promise<MetricSnapshot[]> {
  const result = await chrome.storage.local.get(readingsKey(url));
  return (result[readingsKey(url)] as MetricSnapshot[] | undefined) ?? [];
}

export function isMonitorLatestKey(key: string): boolean {
  return key.startsWith(PREFIX) && key.endsWith(':latest');
}

export function isMonitorReadingsKey(key: string): boolean {
  return key.startsWith(PREFIX) && key.endsWith(':readings');
}

export function urlFromKey(key: string): string {
  // "pp:monitor:<url>:latest" or "pp:monitor:<url>:readings"
  const inner = key.slice(PREFIX.length);
  return inner.slice(0, inner.lastIndexOf(':'));
}
