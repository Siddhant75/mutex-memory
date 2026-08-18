import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 60_000,
    projects: ['packages/*', 'services/*'],
    testTimeout: 30_000,
  },
});
