import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Set before any module loads: middleware/auth.ts and middleware/upload.ts
    // read these at import time. The size thresholds are read lazily, so tests
    // override those per-case with vi.stubEnv().
    env: {
      SUPABASE_JWT_SECRET: 'test-jwt-secret-not-used-in-production',
      UPLOAD_DIR: './.test-uploads',
      DOWNLOAD_TOKEN_SECRET: 'test-download-secret',
    },
  },
});
