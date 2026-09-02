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

/** Generous upper bound for a report (the textarea caps at 2000 chars plus a small context object). */
export const MAX_BODY_BYTES = 64 * 1024;

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Reads a JSON body, rejecting once more than `limit` bytes have arrived. Exported for tests. */
export async function readJson(req: IncomingMessage, limit: number = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, 'payload_too_large', `Request body exceeds ${limit} bytes`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.byteLength;
    if (size > limit) {
      req.pause();
      throw new HttpError(413, 'payload_too_large', `Request body exceeds ${limit} bytes`);
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'bad_request', 'Body is not valid JSON');
  }
}

function isJsonContentType(req: IncomingMessage): boolean {
  const type = req.headers['content-type'] ?? '';
  return type.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

/** Responds and then drops the connection so an unread request body cannot keep the socket busy. */
function reject(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void {
  res.setHeader('Connection', 'close');
  res.once('finish', () => req.destroy());
  send(res, status, body);
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
    if (!isJsonContentType(req)) {
      return reject(req, res, 415, { error: 'unsupported_media_type', message: 'Content-Type must be application/json' });
    }
    try {
      const body = await readJson(req);
      if (!isPayload(body)) return send(res, 400, { error: 'bad_request', message: 'Expected JSON { description, context }' });
      const session = await createDevinSession(body, cfg);
      send(res, 200, session);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (err instanceof HttpError) {
        reject(req, res, err.status, { error: err.code, message: err.message });
      } else if (e.code === 'not_configured') {
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
      server.middlewares.use('/api/report-bug', (req, res, next) => void handler(req, res, next));
    },
  };
}
