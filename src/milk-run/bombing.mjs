// Provisional bombing module: an attempt completes the target leg even on a miss.
// Future station requirements belong here, rather than in presentation code.
import { die } from './random.mjs';

export function resolveBombing(state, emit) {
  emit({ type: 'BOMBING_STARTED', message: 'Target reached. Begin the provisional bombing run.' });
  const roll = die(state, 6);
  emit({ type: 'BOMBING_ROLL', roll, message: `Bombing roll: ${roll}. ${state.config.bombingMin}+ hits the target.` });
  const success = roll >= state.config.bombingMin;
  state.mission.bombed = true;
  state.mission.bombingResult = success ? 'hit' : 'miss';
  emit({ type: 'BOMBING_RESOLVED', message: success ? 'Bombs on target. Begin the return journey.' : 'Bombs missed. The bombing attempt is complete; return home.' });
}
