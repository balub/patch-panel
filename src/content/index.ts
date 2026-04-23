import { getState, onStateChange } from '../shared/storage';
import type { StoredState } from '../shared/types';
import { BAR_HEIGHT_DEFAULT } from '../shared/types';
import { renderBar, unmountBar } from './bar';

function apply(state: StoredState) {
  if (state.config && state.config.items.length > 0) {
    renderBar({
      config: state.config,
      mode: state.displayMode ?? 'icon_text',
      barHeight: state.barHeight ?? BAR_HEIGHT_DEFAULT,
      autoHide: state.autoHide ?? false,
    });
  } else {
    unmountBar();
  }
}

async function init() {
  const state = await getState();
  apply(state);
  onStateChange(apply);
}

void init();
