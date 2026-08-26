#!/usr/bin/env node
/**
 * Wraps a PNG into a Windows .ico file — used by install.ps1 to give the
 * Start Menu shortcut a proper icon.
 *
 * Vista and newer accept a PNG stored verbatim inside an ICO container,
 * so this is a 22-byte header plus the original bytes: no image library,
 * no build step (see docs/TODO.md — zero dependencies until Phase 3).
 */

import fs from 'node:fs';

/** Reads width/height from a PNG's IHDR chunk. */
export function pngSize(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error('Not a PNG file');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Builds a single-image ICO around the given PNG bytes. */
export function pngToIco(png) {
  const { width, height } = pngSize(png);
  if (width > 256 || height > 256) {
    throw new Error(`Icon must be at most 256x256, got ${width}x${height}`);
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(width === 256 ? 0 : width, 0); // 0 means 256
  entry.writeUInt8(height === 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); // palette size (0 = no palette)
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12); // pixel data offset

  return Buffer.concat([header, entry, png]);
}

// CLI: make-ico.js <input.png> <output.ico>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: make-ico.js <input.png> <output.ico>');
    process.exit(2);
  }
  fs.writeFileSync(output, pngToIco(fs.readFileSync(input)));
  console.log(`Wrote ${output}`);
}
