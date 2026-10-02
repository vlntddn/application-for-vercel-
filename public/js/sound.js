import { state } from './state.js';

/**
 * Answer feedback sounds, brutalism-flavoured: two short square-wave
 * blips synthesized with WebAudio — no audio files, no dependencies.
 * Silent when the profile has sound off or the browser lacks WebAudio.
 */

let ctx = null;

function audioContext() {
  // No `window` outside the browser (Node test runs) — stay silent.
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function enabled() {
  // Older stored profiles have no "sound" field — treat as on.
  return state.progress?.profile?.sound !== false;
}

function blip(notes) {
  if (!enabled()) return;
  const ac = audioContext();
  if (!ac) return;
  const t0 = ac.currentTime;
  for (const [freq, start, len] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, t0 + start);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + start + len);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + len);
  }
}

/**
 * Haptic feedback alongside the blips. Only fires when the profile allows it
 * and the device supports `navigator.vibrate`; otherwise a silent no-op.
 * Some platforms throw on unexpected patterns, so vibration is best-effort.
 */
function vibrate(pattern) {
  if (!enabled()) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore — haptics must never break the answer flow.
  }
}

/** Rising major third — short and dry. */
export function playCorrect() {
  blip([[660, 0, 0.09], [880, 0.09, 0.12]]);
  vibrate([30]);
}

/** Single low buzz — unmistakably wrong, not punishing. */
export function playWrong() {
  blip([[160, 0, 0.22]]);
  vibrate([60, 40, 60]);
}
