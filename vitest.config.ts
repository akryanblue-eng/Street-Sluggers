import { defineConfig } from 'vitest/config';

// Deterministic gameplay tests. jsdom is only needed for the few
// component-adjacent tests; the pure physics/logic suites run in node.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
