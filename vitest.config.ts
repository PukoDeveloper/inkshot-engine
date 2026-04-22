import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // jsdom provides browser APIs (navigator, document, etc.) required by
    // pixi.js when it is imported as a value (not type-only).  Without this,
    // any test that transitively imports a pixi.js value export (Container,
    // Graphics, Sprite, …) fails with "ReferenceError: navigator is not
    // defined" in the default Node.js test environment.
    environment: 'jsdom',
  },
});
