import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/** What the in-game "Report Bug" dialog sends. */
export interface BugReportPayload {
  readonly description: string;
  readonly context: Record<string, unknown>;
}

export interface DevinConfig {
  readonly apiKey?: string;
  readonly orgId?: string;
  /** GitHub URL of this repo, so the Devin Cloud agent knows where to work. */
  readonly repo?: string;
  readonly apiBase?: string;
  /**
   * Also expose the endpoint on `vite preview`. Off by default: a preview server
   * started with `--host` would otherwise proxy anyone on the network into Devin.
   */
  readonly allowPreview?: boolean;
}

const DEFAULT_API_BASE = 'https://api.devin.ai/v3';

/** Turns a report into the prompt handed to Devin. Exported for tests. */
export function buildPrompt(report: BugReportPayload, cfg: DevinConfig): string {
  const repoLine = cfg.repo
    ? `Repository: ${cfg.repo}`
    : 'Repository: NOT CONFIGURED. Ask the user for the GitHub URL of the arcade-battleship repo (set DEVIN_REPO in .env.local to skip this next time).';
  const context = Object.entries(report.context)
    .map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');
  return [
    'Bug report submitted from the in-game "Report Bug" button of Arcade Battleship (Vite + TypeScript browser game).',
    repoLine,
    '',
    'Player description:',
    report.description.trim() || '(none provided)',
    '',
    'Captured context:',
    context,
    '',
    'Please: reproduce (npm run dev, then npm run smoke drives every screen headlessly), find the root cause in src/,',
    'fix it with a regression test where practical, make sure `npm run typecheck && npm test && npm run build` pass,',
    'and open a pull request describing the cause and the fix.',
  ].join('\n');
}

function hostOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

/**
 * Rejects anything that is not a genuine same-origin JSON call from the game:
 * a cross-origin page can forge a "simple" POST (no preflight) otherwise, and
 * spend the org's Devin credits on an attacker-written prompt. Exported for tests.
 */
export function rejectReason(req: IncomingMessage): string | undefined {
  const contentType = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return 'Content-Type must be application/json';
  const fetchSite = req.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') return 'Cross-origin requests are not allowed';
  // Browsers always attach Origin to a POST, so a request without one is not the game.
  const claimed = hostOf(req.headers.origin) ?? hostOf(req.headers.referer);
  if (claimed === undefined) return 'Missing Origin header';
  if (claimed !== req.headers.host) return 'Cross-origin requests are not allowed';
  return undefined;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function isPayload(value: unknown): value is BugReportPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['description'] === 'string' && typeof v['context'] === 'object' && v['context'] !== null;
}

/** Creates a Devin session via the v3 API. Exported for tests (fetch is injectable). */
export async function createDevinSession(
  report: BugReportPayload,
  cfg: DevinConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string; sessionId: string }> {
  if (!cfg.apiKey || !cfg.orgId) throw Object.assign(new Error('Devin is not configured'), { code: 'not_configured' });
  const res = await fetchImpl(`${cfg.apiBase ?? DEFAULT_API_BASE}/organizations/${cfg.orgId}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: buildPrompt(report, cfg), title: `Arcade Battleship bug: ${report.description.slice(0, 60) || 'untitled'}` }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`Devin API ${res.status}: ${text.slice(0, 300)}`), { code: 'upstream' });
  }
  const data = (await res.json()) as { session_id?: string; url?: string };
  if (!data.url || !data.session_id) throw Object.assign(new Error('Devin API returned no session URL'), { code: 'upstream' });
  return { url: data.url, sessionId: data.session_id };
}

/**
 * Vite plugin: `POST /api/report-bug` on the dev and preview servers. The API
 * key never leaves the server, so it is safe to ship the button in the client.
 */
export function devinBugReportPlugin(cfg: DevinConfig): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    if (req.method !== 'POST') return next();
    const reason = rejectReason(req);
    if (reason) return send(res, 403, { error: 'forbidden', message: reason });
    try {
      const body = await readJson(req).catch(() => undefined);
      if (!isPayload(body)) return send(res, 400, { error: 'bad_request', message: 'Expected JSON { description, context }' });
      const session = await createDevinSession(body, cfg);
      send(res, 200, session);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'not_configured') {
        send(res, 501, {
          error: 'not_configured',
          message: 'Set DEVIN_API_KEY and DEVIN_ORG_ID in .env.local (see .env.example) to hand bugs to a Devin Cloud agent.',
        });
      } else {
        send(res, 502, { error: 'upstream', message: e.message });
      }
    }
  };
  return {
    name: 'arcade-battleship:devin-bug-report',
    configureServer(server) {
      server.middlewares.use('/api/report-bug', (req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      if (!cfg.allowPreview) return;
      server.middlewares.use('/api/report-bug', (req, res, next) => void handler(req, res, next));
    },
  };
}
