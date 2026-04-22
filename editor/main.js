// editor/main.js
//
// Game entry point — runs entirely in the browser with no build step required.
//
// "@inkshot/engine" is resolved by the importmap in index.html to the
// pre-built dist/engine.bundle.js, so every module on this page shares the
// same engine instance.
//
// ── How to add a plugin ───────────────────────────────────────────────────
//
//   1. Build your plugin as an ESM file with "@inkshot/engine" declared as
//      external (so it does NOT re-bundle the engine):
//
//        // rolldown.plugin.config.js (inside the plugin project)
//        export default {
//          input: 'src/index.ts',
//          platform: 'browser',
//          output: { file: 'dist/my-plugin.js', format: 'esm' },
//          external: ['@inkshot/engine'],
//        };
//
//   2. Copy the built .js file into the editor/plugins/ directory.
//
//   3. Import it here and pass it to createEngine:
//
//        import myPlugin from './plugins/my-plugin.js';
//        const { core } = await createEngine({ plugins: [myPlugin], ... });
//
// ─────────────────────────────────────────────────────────────────────────

import { createEngine } from '@inkshot/engine';

const { core, renderer } = await createEngine({
  container: '#app',
  width: window.innerWidth,
  height: window.innerHeight,
  // plugins: [],        // add EnginePlugin objects or URL strings here
  // dataRoot: '/assets/',
});

// Example: listen for the engine destroy event
core.events.on('main', 'core/destroy', () => {
  console.log('[main] Engine destroyed.');
});

console.log('[main] Inkshot Engine started.', { core, renderer });
