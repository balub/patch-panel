import type {
  DisplayMode,
  GroupItem,
  Item,
  MetricKey,
  MonitorGraphItem,
  MonitorValueItem,
  NormalizedConfig,
  ServiceItem,
  ValidationResult,
} from './types';

const DISPLAY_MODES: readonly DisplayMode[] = [
  'icon_only',
  'icon_text',
  'text_only',
];

const VALID_ADAPTERS = new Set(['dashdot', 'glances']);
const VALID_METRICS = new Set<MetricKey>([
  'cpu',
  'ram',
  'gpu',
  'network',
  'disk',
]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isUrlLike(v: unknown): v is string {
  if (!isNonEmptyString(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function validateService(raw: any, errors: string[]): ServiceItem | null {
  const displayName = isNonEmptyString(raw?.name) ? (raw.name as string) : '<unnamed>';
  let ok = true;

  if (!isNonEmptyString(raw?.name)) {
    errors.push('Service is missing `name`');
    ok = false;
  }
  if (!isUrlLike(raw?.url)) {
    errors.push(`Service \`${displayName}\` is missing \`url\``);
    ok = false;
  }
  if (raw?.icon !== undefined && typeof raw.icon !== 'string') {
    errors.push(`Service \`${displayName}\` has non-string \`icon\``);
    ok = false;
  }

  if (!ok) return null;
  return {
    type: 'service',
    name: raw.name as string,
    url: raw.url as string,
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
  };
}

function validateMonitorBase(
  raw: any,
  errors: string[],
): { name: string; adapter: 'dashdot' | 'glances'; url: string; metrics?: MetricKey[]; interval?: number } | null {
  const displayName = isNonEmptyString(raw?.name) ? (raw.name as string) : '<unnamed>';
  let ok = true;

  if (!isNonEmptyString(raw?.name)) {
    errors.push('Monitor item is missing `name`');
    ok = false;
  }
  if (!isUrlLike(raw?.url)) {
    errors.push(`Monitor \`${displayName}\` is missing a valid \`url\``);
    ok = false;
  }
  if (!VALID_ADAPTERS.has(raw?.adapter)) {
    errors.push(
      `Monitor \`${displayName}\` has unknown \`adapter\` \`${String(raw?.adapter)}\` — expected: dashdot, glances`,
    );
    ok = false;
  }
  if (raw?.metrics !== undefined) {
    if (
      !Array.isArray(raw.metrics) ||
      !(raw.metrics as unknown[]).every((m) => VALID_METRICS.has(m as MetricKey))
    ) {
      errors.push(
        `Monitor \`${displayName}\` has invalid \`metrics\` — valid values: ${[...VALID_METRICS].join(', ')}`,
      );
      ok = false;
    }
  }
  if (raw?.interval !== undefined && (typeof raw.interval !== 'number' || raw.interval < 1)) {
    errors.push(`Monitor \`${displayName}\` \`interval\` must be a number ≥ 1`);
    ok = false;
  }

  if (!ok) return null;
  return {
    name: raw.name as string,
    adapter: raw.adapter as 'dashdot' | 'glances',
    url: raw.url as string,
    metrics: Array.isArray(raw.metrics) ? (raw.metrics as MetricKey[]) : undefined,
    interval: typeof raw.interval === 'number' ? raw.interval : undefined,
  };
}

function validateMonitorValue(raw: any, errors: string[]): MonitorValueItem | null {
  const base = validateMonitorBase(raw, errors);
  if (!base) return null;
  return { type: 'monitor-value', ...base };
}

function validateMonitorGraph(raw: any, errors: string[]): MonitorGraphItem | null {
  const base = validateMonitorBase(raw, errors);
  if (!base) return null;

  let history: number | undefined;
  if (raw?.history !== undefined) {
    if (typeof raw.history !== 'number' || raw.history < 2) {
      errors.push(`Monitor \`${base.name}\` \`history\` must be a number ≥ 2`);
      return null;
    }
    history = raw.history as number;
  }

  return { type: 'monitor-graph', ...base, history };
}

function validateItem(raw: unknown, errors: string[], context: string): Item | null {
  const type = (raw as any)?.type;
  if (type === 'service') return validateService(raw, errors);
  if (type === 'monitor-value') return validateMonitorValue(raw, errors);
  if (type === 'monitor-graph') return validateMonitorGraph(raw, errors);
  if (type === 'group') {
    errors.push(`${context}: nested groups are not allowed`);
    return null;
  }
  errors.push(`${context}: unknown item type \`${String(type)}\``);
  return null;
}

function validateGroup(raw: any, errors: string[]): GroupItem | null {
  const displayName = isNonEmptyString(raw?.name) ? (raw.name as string) : '<unnamed>';
  let ok = true;

  if (!isNonEmptyString(raw?.name)) {
    errors.push('Group is missing `name`');
    ok = false;
  }
  if (!Array.isArray(raw?.items) || raw.items.length === 0) {
    errors.push(`Group \`${displayName}\` has missing or empty \`items\``);
    ok = false;
  }
  if (raw?.icon !== undefined && typeof raw.icon !== 'string') {
    errors.push(`Group \`${displayName}\` has non-string \`icon\``);
    ok = false;
  }

  if (!ok) return null;

  const children: Item[] = [];
  for (const childRaw of raw.items as unknown[]) {
    const child = validateItem(childRaw, errors, `Group \`${displayName}\``);
    if (child) children.push(child);
  }

  if (children.length === 0) return null;
  return {
    type: 'group',
    name: raw.name as string,
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
    items: children,
  };
}

export function validate(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push('Root must be an object');
    return { ok: false, errors };
  }

  const root = input as Record<string, unknown>;

  if (!Array.isArray(root.items) || root.items.length === 0) {
    errors.push('Root `items` array is missing');
    return { ok: false, errors };
  }

  let displayMode: DisplayMode | undefined;
  if (root.displayMode !== undefined) {
    if (
      typeof root.displayMode !== 'string' ||
      !DISPLAY_MODES.includes(root.displayMode as DisplayMode)
    ) {
      errors.push(`Invalid displayMode \`${String(root.displayMode)}\``);
    } else {
      displayMode = root.displayMode as DisplayMode;
    }
  }

  const items: Item[] = [];
  for (const raw of root.items as unknown[]) {
    const type = (raw as any)?.type;
    if (type === 'group') {
      const item = validateGroup(raw, errors);
      if (item) items.push(item);
    } else {
      const item = validateItem(raw, errors, 'Root');
      if (item) items.push(item);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const config: NormalizedConfig = { items };
  if (typeof root.title === 'string') config.title = root.title;
  if (displayMode) config.displayMode = displayMode;
  return { ok: true, config };
}
