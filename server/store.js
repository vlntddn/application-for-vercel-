import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { migrateProgress } from '../public/js/domain/progress.js';

/**
 * File-backed JSON store with atomic writes (write to temp file, then
 * rename) and serialized persistence so concurrent requests can never
 * interleave partial writes or lose updates.
 */
export class JsonStore {
  constructor(file, initial) {
    this.file = file;
    this.tmp = `${file}.tmp`;
    this.initial = initial;
    this.data = structuredClone(initial);
    this.writeQueue = Promise.resolve();
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // The same migration the browser uses: a file written by an older
        // version opens with its history intact, missing fields filled in.
        this.data = migrateProgress(parsed);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Corrupt file: keep it aside instead of silently destroying data.
        const backup = `${this.file}.corrupt.${Date.now()}`;
        try {
          fs.renameSync(this.file, backup);
        } catch {
          /* ignore */
        }
        console.error(`Could not parse ${this.file}; moved to ${backup}`);
      }
      this.data = structuredClone(this.initial);
    }
    return this;
  }

  persist() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await fsp.writeFile(this.tmp, snapshot, 'utf8');
      await fsp.rename(this.tmp, this.file);
    });
    return this.writeQueue;
  }

  reset() {
    this.data = structuredClone(this.initial);
    return this.persist();
  }

  /** Resolves when all pending writes have hit disk. */
  flush() {
    return this.writeQueue;
  }
}
