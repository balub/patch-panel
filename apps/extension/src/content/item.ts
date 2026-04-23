import type { ServiceItem } from '../shared/types';

interface IconSource {
  name: string;
  icon?: string;
}

export function renderIcon(source: IconSource): HTMLElement {
  if (source.icon) {
    const img = document.createElement('img');
    img.className = 'icon';
    img.src = source.icon;
    img.alt = '';
    img.onerror = () => {
      img.replaceWith(fallbackIcon(source.name));
    };
    return img;
  }
  return fallbackIcon(source.name);
}

export function fallbackIcon(name: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'icon fallback';
  const trimmed = name.trim();
  span.textContent = (trimmed.length > 0 ? trimmed[0] : '?').toUpperCase();
  return span;
}

export function renderServiceItem(s: ServiceItem): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'item';
  a.href = s.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = s.name;

  a.appendChild(renderIcon(s));

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = s.name;
  a.appendChild(label);

  return a;
}
