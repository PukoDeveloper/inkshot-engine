// rolldown.bundle.config.js
// Builds dist/engine.bundle.js — a self-contained ESM bundle for use in
// browsers without Node.js or a build step on the consumer side.
//
// The bundle inlines pixi.js and all engine code so that an HTML page only
// needs to include a single <script type="importmap"> entry pointing here,
// while plugins can declare "@inkshot/engine" as external (keeping their own
// file sizes minimal and sharing the engine instance).

const banner = `/*!
 * @inkshot/engine v0.2.8
 * https://github.com/PukoDeveloper/inkshot-engine
 *
 * ISC License
 *
 * Copyright (c) 2026 PukoDeveloper
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 *
 * --------------------------------------------------------------------------
 *
 * Includes pixi.js v8.18.1
 * https://github.com/pixijs/pixijs
 *
 * The MIT License
 *
 * Copyright (c) 2013-2023 Mathew Groves, Chad Engler
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
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
