import { test } from 'node:test';
import assert from 'node:assert/strict';

import { playCorrect, playWrong } from '../public/js/sound.js';
import { state } from '../public/js/state.js';

/**
 * Replace `navigator.vibrate` with a spy, return it so a test can read the
 * patterns it was called with. `vibrate` is not part of Node's navigator, so
 * this mirrors an environment where the API is present.
 */
function withVibrate() {
  const calls = [];
  const spy = (pattern) => { calls.push(pattern); };
  Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate: spy },
    configurable: true,
    writable: true,
  });
  return calls;
}

/** Replace `navigator` with one that has no `vibrate` (the Node default). */
function withoutVibrate() {
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    configurable: true,
    writable: true,
  });
}

/** `sound.js` is browser-only — sound on by default when no profile is set. */
test('playCorrect / playWrong never throw when navigator.vibrate is absent', () => {
  withoutVibrate();
  assert.doesNotThrow(() => playCorrect());
  assert.doesNotThrow(() => playWrong());
});

test('a correct answer vibrates the short pattern [30]', () => {
  const calls = withVibrate();
  playCorrect();
  assert.deepEqual(calls, [[30]]);
});

test('a wrong answer vibrates the buzz pattern [60, 40, 60]', () => {
  const calls = withVibrate();
  playWrong();
  assert.deepEqual(calls, [[60, 40, 60]]);
});

test('vibration respects the sound toggle (off -> no vibration)', () => {
  const calls = withVibrate();
  state.progress = { profile: { sound: false } };
  try {
    playCorrect();
    playWrong();
    assert.deepEqual(calls, [], 'sound off -> nothing vibrates');
  } finally {
    state.progress = null;
    withoutVibrate();
  }
});
