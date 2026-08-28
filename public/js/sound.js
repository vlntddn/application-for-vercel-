import { state } from './state.js';

/**
 * Answer feedback sounds, brutalism-flavoured: two short square-wave
 * blips synthesized with WebAudio — no audio files, no dependencies.
 * Silent when the profile has sound off or the browser lacks WebAudio.
 */

let ctx = null;

function audioContext() {
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

/** Rising major third — short and dry. */
export function playCorrect() {
  blip([[660, 0, 0.09], [880, 0.09, 0.12]]);
}

/** Single low buzz — unmistakably wrong, not punishing. */
export function playWrong() {
  blip([[160, 0, 0.22]]);
}
