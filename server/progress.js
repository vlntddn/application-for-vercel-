/**
 * The progress domain lives in public/js/domain/progress.js because it
 * has to run in two places: this Node server (writing progress.json) and
 * the browser (writing localStorage, when the app is hosted statically).
 * It is pure JavaScript with no imports, so both hosts share one
 * implementation of the rules instead of duplicating validation.
 */
export {
  LANGUAGES,
  THEMES,
  EMPTY_PROGRESS,
  ValidationError,
  ProgressService,
} from '../public/js/domain/progress.js';
