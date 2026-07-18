import type { SessionPhase } from './session-machine';

const lowValue = new Set<SessionPhase>(['starting', 'planning', 'reading']);
const terminal = new Set<SessionPhase>(['completed', 'waiting', 'needs_review', 'external', 'failed', 'interrupted']);

export function enqueueVisualPhase(current: SessionPhase, queue: SessionPhase[], next: SessionPhase): SessionPhase[] {
  if (next === current || queue.at(-1) === next) return queue;
  let result = [...queue];
  if (terminal.has(next)) {
    result = result.filter((phase) => !lowValue.has(phase));
  } else if (next === 'approval' || next === 'input') {
    result = result.filter((phase) => !lowValue.has(phase));
  }
  result.push(next);
  if (result.length > 3) {
    const firstLowValue = result.findIndex((phase) => lowValue.has(phase));
    if (firstLowValue >= 0) result.splice(firstLowValue, 1);
  }
  return result;
}

export function phaseDwellMs(phase: SessionPhase): number {
  return terminal.has(phase) || phase === 'idle' ? Number.POSITIVE_INFINITY : 650;
}
