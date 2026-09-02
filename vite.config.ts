import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { devinBugReportPlugin } from './server/bugReport.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => {
  // Empty prefix so the server-only DEVIN_* variables from .env.local are visible here (never to the client).
  const env = loadEnv(mode, process.cwd(), '');
  // In GitHub Actions the repo is known; locally it comes from .env.local.
  const ghRepo = process.env['GITHUB_REPOSITORY'];
  const repoUrl = env['DEVIN_REPO'] || (ghRepo ? `https://github.com/${ghRepo}` : '');
  // GitHub Pages serves project sites from /<repo>/.
  const base = process.env['GITHUB_ACTIONS'] && ghRepo ? `/${ghRepo.split('/')[1]}/` : '/';
  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(pkg.version), __REPO_URL__: JSON.stringify(repoUrl) },
    plugins: [
      devinBugReportPlugin({
        apiKey: env['DEVIN_API_KEY'],
        orgId: env['DEVIN_ORG_ID'],
        repo: repoUrl || undefined,
        allowPreview: env['DEVIN_BUG_REPORT_PREVIEW'] === '1',
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
