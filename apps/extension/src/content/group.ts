import type { GroupItem, Item } from '../shared/types';
import { renderIcon, renderServiceItem } from './item';
import { renderMonitorValue } from './monitor-value';
import { renderMonitorGraph } from './monitor-graph';
import { attachDropdown } from './dropdown';

function renderChildItem(item: Item): HTMLElement {
  if (item.type === 'service') return renderServiceItem(item);
  if (item.type === 'monitor-value') return renderMonitorValue(item, 'dropdown');
  if (item.type === 'monitor-graph') return renderMonitorGraph(item, 'dropdown');
  // type: 'group' is blocked by schema validation — unreachable
  return renderServiceItem(item as never);
}

export function renderGroupItem(
  g: GroupItem,
  shadow: ShadowRoot,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'item group';
  btn.type = 'button';
  btn.title = g.name;

  btn.appendChild(renderIcon(g));

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = g.name;
  btn.appendChild(label);

  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.textContent = '▾';
  btn.appendChild(caret);

  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown';
  for (const child of g.items) {
    dropdown.appendChild(renderChildItem(child));
  }

  attachDropdown(btn, dropdown, shadow);

  return btn;
}
