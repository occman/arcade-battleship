import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { devinBugReportPlugin } from './server/bugReport.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => {
  // Empty prefix so the server-only DEVIN_* variables from .env.local are visible here (never to the client).
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [
      devinBugReportPlugin({
        apiKey: env['DEVIN_API_KEY'],
        orgId: env['DEVIN_ORG_ID'],
        repo: env['DEVIN_REPO'],
      }),
    ],
    server: { port: 5173, strictPort: false, open: false },
    build: { target: 'es2022' },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
