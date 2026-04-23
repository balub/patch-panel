import type {
  DisplayMode,
  GroupItem,
  Item,
  NormalizedConfig,
  ServiceItem,
  ValidationResult,
} from './types';

const DISPLAY_MODES: readonly DisplayMode[] = [
  'icon_only',
  'icon_text',
  'text_only',
];

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
  const displayName = isNonEmptyString(raw?.name)
    ? (raw.name as string)
    : '<unnamed>';
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

function validateGroup(raw: any, errors: string[]): GroupItem | null {
  const displayName = isNonEmptyString(raw?.name)
    ? (raw.name as string)
    : '<unnamed>';
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

  const children: ServiceItem[] = [];
  for (const childRaw of raw.items as unknown[]) {
    const childType = (childRaw as any)?.type;
    if (childType === 'group') {
      errors.push(
        `Group \`${displayName}\` contains an invalid child item (nested groups are not allowed)`,
      );
      continue;
    }
    if (childType !== 'service') {
      errors.push(
        `Group \`${displayName}\` contains an invalid child item (unknown type \`${String(childType)}\`)`,
      );
      continue;
    }
    const child = validateService(childRaw, errors);
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
    if (type === 'service') {
      const item = validateService(raw, errors);
      if (item) items.push(item);
    } else if (type === 'group') {
      const item = validateGroup(raw, errors);
      if (item) items.push(item);
    } else {
      errors.push(`Unknown item type \`${String(type)}\``);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const config: NormalizedConfig = { items };
  if (typeof root.title === 'string') config.title = root.title;
  if (displayMode) config.displayMode = displayMode;
  return { ok: true, config };
}
