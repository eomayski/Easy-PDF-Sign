import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Версията на helper agent-а идва от `helper-agent/package.json` — единственият
 * източник на истина. Инжектира се като `__HELPER_VERSION__` (виж
 * `src/vite-env.d.ts`), за да не се дублира числото във frontend-а.
 *
 * Ако файлът не е достъпен при билда (напр. deploy само на `frontend/`),
 * връщаме '0.0.0' — тогава `isOlderVersion(current, '0.0.0')` е false и банерът
 * „налична е нова версия“ просто не се показва, вместо да лъже потребителя.
 */
function readHelperVersion(): string {
  const candidates = [
    fileURLToPath(new URL('../helper-agent/package.json', import.meta.url)),
    resolve(process.cwd(), '../helper-agent/package.json'),
  ];
  for (const path of candidates) {
    try {
      const { version } = JSON.parse(readFileSync(path, 'utf8')) as { version: string };
      if (version) return version;
    } catch {
      /* пробваме следващия кандидат */
    }
  }
  console.warn('[vite] helper-agent/package.json не е намерен — update банерът е изключен');
  return '0.0.0';
}

export default defineConfig({
  define: {
    __HELPER_VERSION__: JSON.stringify(readHelperVersion()),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/downloads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
});
