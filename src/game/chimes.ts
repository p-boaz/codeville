import type { VillageEvent } from '../shared/village-events';

export type ChimeKind = 'needs_you' | 'landed' | 'failed';

/**
 * Supervision is a background activity; three quiet, distinct chimes are how
 * the command center works when nobody is watching the screen. Synthesized at
 * runtime — no assets, nothing fetched.
 */
export function chimeForEvent(event: VillageEvent): ChimeKind | null {
  switch (event.type) {
    case 'approval_required':
    case 'input_required':
    case 'diff_ready':
      return 'needs_you';
    case 'session_applied':
    case 'session_kept':
      return 'landed';
    case 'session_failed':
      return 'failed';
    default:
      return null;
  }
}

const notes: Record<ChimeKind, { frequencies: number[]; duration: number }> = {
  needs_you: { frequencies: [659.3, 880], duration: 0.14 },
  landed: { frequencies: [523.3, 659.3, 784], duration: 0.11 },
  failed: { frequencies: [220, 207.7], duration: 0.2 },
};

let context: AudioContext | null = null;

export function playChime(kind: ChimeKind): void {
  if (typeof AudioContext === 'undefined') return;
  try {
    context ??= new AudioContext();
    const { frequencies, duration } = notes[kind];
    const start = context.currentTime + 0.01;
    frequencies.forEach((frequency, index) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const at = start + index * duration;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.06, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain).connect(context!.destination);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
    });
  } catch {
    // Sound is a convenience; never let audio failures affect supervision.
  }
}
