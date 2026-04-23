import { getState, onStateChange } from '../shared/storage';
import type { StoredState } from '../shared/types';
import { renderBar, unmountBar } from './bar';

function apply(state: StoredState) {
  if (state.config && state.config.items.length > 0) {
    renderBar(state.config, state.displayMode ?? 'icon_text');
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
