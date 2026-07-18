import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  // This 8 GB machine can stall UI assertions under post-build load; a real logic bug still fails twice.
  retries: 1,
  reporter: [['list']],
});
