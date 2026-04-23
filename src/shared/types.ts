export type DisplayMode = 'icon_only' | 'icon_text' | 'text_only';

export interface ServiceItem {
  type: 'service';
  name: string;
  url: string;
  icon?: string;
}

export interface GroupItem {
  type: 'group';
  name: string;
  icon?: string;
  items: ServiceItem[];
}

export type Item = ServiceItem | GroupItem;

export interface NormalizedConfig {
  title?: string;
  displayMode?: DisplayMode;
  items: Item[];
}

export interface StoredState {
  rawYaml?: string;
  config?: NormalizedConfig;
  displayMode?: DisplayMode;
  barHeight?: number;
  autoHide?: boolean;
  schemaVersion?: 1;
}

export const BAR_HEIGHT_DEFAULT = 30;
export const BAR_HEIGHT_MIN = 20;
export const BAR_HEIGHT_MAX = 60;

export type ValidationResult =
  | { ok: true; config: NormalizedConfig }
  | { ok: false; errors: string[] };
