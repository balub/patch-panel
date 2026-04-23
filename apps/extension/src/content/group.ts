import type { GroupItem } from '../shared/types';
import { renderIcon, renderServiceItem } from './item';
import { attachDropdown } from './dropdown';

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
    dropdown.appendChild(renderServiceItem(child));
  }

  attachDropdown(btn, dropdown, shadow);

  return btn;
}
