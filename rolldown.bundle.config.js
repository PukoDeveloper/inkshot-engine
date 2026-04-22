// rolldown.bundle.config.js
// Builds dist/engine.bundle.js — a self-contained ESM bundle for use in
// browsers without Node.js or a build step on the consumer side.
//
// The bundle inlines pixi.js and all engine code so that an HTML page only
// needs to include a single <script type="importmap"> entry pointing here,
// while plugins can declare "@inkshot/engine" as external (keeping their own
// file sizes minimal and sharing the engine instance).

import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Read license texts directly from disk at build time so that upgrading
// pixi.js (or this package) automatically keeps the banner accurate without
// any manual edits.
const ownPkg   = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const pixiPkg  = require('pixi.js/package.json');
const ownLicense  = readFileSync(new URL('./LICENSE', import.meta.url), 'utf8').trim();
const pixiLicense = readFileSync(require.resolve('pixi.js/LICENSE'), 'utf8').trim();

// Prefix every line with " * " to fit inside a block comment.
const indent = (text) => text.split('\n').map((l) => (l.trim() ? ` * ${l}` : ' *')).join('\n');

const banner = `/*!
 * @inkshot/engine v${ownPkg.version}
 * https://github.com/PukoDeveloper/inkshot-engine
 *
${indent(ownLicense)}
 *
 * --------------------------------------------------------------------------
 *
 * Includes pixi.js v${pixiPkg.version}
 * https://github.com/pixijs/pixijs
 *
${indent(pixiLicense)}
 */`;

/** @type {import('rolldown').RolldownOptions} */
export default {
  input: 'src/index.ts',
  platform: 'browser',
  output: {
    file: 'dist/engine.bundle.js',
    format: 'esm',
    sourcemap: true,
    minify: true,
    // Disable code-splitting so the output is a single self-contained file.
    // Dynamic imports inside the engine (e.g. the Web Worker bridge) remain
    // functional because the worker source is inlined as a Blob URL at runtime.
    codeSplitting: false,
    // Preserve license notices at the top of the minified bundle so that
    // distributing engine.bundle.js alone is sufficient for attribution.
    banner,
  },
};
