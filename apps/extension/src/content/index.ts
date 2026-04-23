import { getState, onStateChange } from '../shared/storage';
import type { StoredState } from '../shared/types';
import {
  BAR_HEIGHT_DEFAULT,
  BAR_POSITION_DEFAULT,
  BAR_WIDTH_DEFAULT,
} from '../shared/types';
import { renderBar, unmountBar } from './bar';

function apply(state: StoredState) {
  if (state.config && state.config.items.length > 0) {
    renderBar({
      config: state.config,
      mode: state.displayMode ?? 'icon_text',
      position: state.barPosition ?? BAR_POSITION_DEFAULT,
      barHeight: state.barHeight ?? BAR_HEIGHT_DEFAULT,
      barWidth: state.barWidth ?? BAR_WIDTH_DEFAULT,
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
