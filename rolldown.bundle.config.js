// rolldown.bundle.config.js
// Builds dist/engine.bundle.js — a self-contained ESM bundle for use in
// browsers without Node.js or a build step on the consumer side.
//
// The bundle inlines pixi.js and all engine code so that an HTML page only
// needs to include a single <script type="importmap"> entry pointing here,
// while plugins can declare "@inkshot/engine" as external (keeping their own
// file sizes minimal and sharing the engine instance).

const banner = `/*!
 * @inkshot/engine
 * Copyright (c) 2026 PukoDeveloper
 * Licensed under the ISC License
 * https://github.com/PukoDeveloper/inkshot-engine
 *
 * Includes pixi.js v8.18.1
 * Copyright (c) 2013-2025 Mathew Groves, Chad Engler
 * Licensed under the MIT License
 * https://github.com/pixijs/pixijs
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
