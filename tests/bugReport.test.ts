import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { buildPrompt, createDevinSession, devinBugReportPlugin, readJson, rejectReason, type BugReportPayload } from '../server/bugReport.ts';
import { formatReport, githubCrashIssueUrl, githubIssueUrl } from '../src/bugReportFormat.ts';

describe('bug report -> GitHub issue', () => {
  it('builds a prefilled new-issue link with title, body and label', () => {
    const url = new URL(githubIssueUrl('https://github.com/oscar/arcade-battleship/', 'Shell landed on the wrong cell\nmore detail', { screen: 'battle' }));
    expect(url.origin + url.pathname).toBe('https://github.com/oscar/arcade-battleship/issues/new');
    expect(url.searchParams.get('title')).toBe('Bug: Shell landed on the wrong cell');
    expect(url.searchParams.get('labels')).toBe('bug');
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('more detail');
    expect(body).toContain('screen: battle');
    expect(body).toContain('@devin');
  });

  it('builds a crash issue link labelled crash with the stack and context', () => {
    const url = new URL(
      githubCrashIssueUrl(
        'https://github.com/oscar/arcade-battleship',
        { message: 'Cannot read properties of undefined\nsecond line', stack: 'TypeError: boom\n    at render (battle.ts:12)' },
        { screen: 'battle' },
      ),
    );
    expect(url.pathname).toBe('/oscar/arcade-battleship/issues/new');
    expect(url.searchParams.get('title')).toBe('Crash: Cannot read properties of undefined');
    expect(url.searchParams.get('labels')).toBe('bug,crash');
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('at render (battle.ts:12)');
    expect(body).toContain('screen: battle');
    expect(body).toContain('@devin');
  });

  it('falls back to the message when a crash has no stack', () => {
    const body = new URL(githubCrashIssueUrl('https://github.com/o/r', { message: 'unhandled rejection: nope' }, {})).searchParams.get('body') ?? '';
    expect(body).toContain('unhandled rejection: nope');
    expect(new URL(githubCrashIssueUrl('https://github.com/o/r', { message: '' }, {})).searchParams.get('title')).toBe('Crash: unknown error');
  });

  it('formats a plain-text report for the clipboard', () => {
    expect(formatReport('', { a: 1 })).toContain('(no description)');
    expect(formatReport('x', { a: { b: 2 } })).toContain('a: {"b":2}');
  });
});

const report: BugReportPayload = {
  description: 'Shell landed on the wrong cell',
  context: { screen: 'battle', phase: 'battle', stats: { human: { shots: 3 } } },
};

describe('bug report -> Devin session', () => {
  it('builds a prompt with the description, context and repo', () => {
    const prompt = buildPrompt(report, { repo: 'https://github.com/oscar/arcade-battleship' });
    expect(prompt).toContain('Shell landed on the wrong cell');
    expect(prompt).toContain('- screen: battle');
    expect(prompt).toContain('- stats: {"human":{"shots":3}}');
    expect(prompt).toContain('Repository: https://github.com/oscar/arcade-battleship');
    expect(prompt).toContain('open a pull request');
  });

  it('tells Devin to ask for the repo when none is configured', () => {
    expect(buildPrompt(report, {})).toContain('Repository: NOT CONFIGURED');
  });

  it('refuses to call the API without credentials', async () => {
    await expect(createDevinSession(report, {})).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('posts to the v3 sessions endpoint with a bearer token and returns the session URL', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ session_id: 'devin-123', url: 'https://app.devin.ai/sessions/devin-123' }), { status: 200 });
    }) as typeof fetch;
    const session = await createDevinSession(report, { apiKey: 'cog_test', orgId: 'org-abc' }, fetchImpl);
    expect(session).toEqual({ sessionId: 'devin-123', url: 'https://app.devin.ai/sessions/devin-123' });
    expect(calls[0]?.url).toBe('https://api.devin.ai/v3/organizations/org-abc/sessions');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer cog_test');
    const body = JSON.parse(String(calls[0]?.init.body)) as { prompt: string; title: string };
    expect(body.prompt).toContain('Shell landed on the wrong cell');
    expect(body.title).toContain('Arcade Battleship bug');
  });

  it('surfaces upstream failures', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 401 })) as typeof fetch;
    await expect(createDevinSession(report, { apiKey: 'x', orgId: 'y' }, fetchImpl)).rejects.toMatchObject({ code: 'upstream' });
  });
});

describe('readJson body limit', () => {
  const fakeReq = (chunks: string[], headers: Record<string, string> = {}): IncomingMessage =>
    Object.assign(Readable.from(chunks.map((c) => Buffer.from(c))), { headers }) as unknown as IncomingMessage;

  it('parses a small body', async () => {
    await expect(readJson(fakeReq(['{"a":', '1}']), 64)).resolves.toEqual({ a: 1 });
  });

  it('rejects with 413 once streamed bytes exceed the limit', async () => {
    const chunks = Array.from({ length: 10 }, () => 'x'.repeat(100));
    await expect(readJson(fakeReq(chunks), 512)).rejects.toMatchObject({ status: 413, code: 'payload_too_large' });
  });

  it('rejects with 413 up front when Content-Length exceeds the limit', async () => {
    await expect(readJson(fakeReq([], { 'content-length': '999999' }), 512)).rejects.toMatchObject({ status: 413 });
  });

  it('rejects malformed JSON with 400', async () => {
    await expect(readJson(fakeReq(['{nope']), 512)).rejects.toMatchObject({ status: 400 });
  });
});

const req = (headers: Record<string, string>): IncomingMessage => ({ headers: { host: 'localhost:5173', ...headers } }) as unknown as IncomingMessage;

describe('bug report endpoint guards', () => {
  it('accepts the same-origin JSON call the game makes', () => {
    expect(rejectReason(req({ 'content-type': 'application/json', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' }))).toBeUndefined();
    expect(rejectReason(req({ 'content-type': 'application/json; charset=utf-8', referer: 'http://localhost:5173/' }))).toBeUndefined();
  });

  it('rejects content types a cross-origin request can send without a preflight', () => {
    expect(rejectReason(req({ 'content-type': 'text/plain;charset=UTF-8', origin: 'http://localhost:5173' }))).toMatch(/Content-Type/);
    expect(rejectReason(req({ origin: 'http://localhost:5173' }))).toMatch(/Content-Type/);
  });

  it('rejects foreign origins, foreign referers and cross-site fetches', () => {
    expect(rejectReason(req({ 'content-type': 'application/json', origin: 'https://evil.example' }))).toMatch(/Cross-origin/);
    expect(rejectReason(req({ 'content-type': 'application/json', referer: 'https://evil.example/x' }))).toMatch(/Cross-origin/);
    expect(rejectReason(req({ 'content-type': 'application/json', origin: 'http://localhost:5173', 'sec-fetch-site': 'cross-site' }))).toMatch(/Cross-origin/);
  });

  it('rejects callers that state no origin, even with same-origin fetch metadata', () => {
    expect(rejectReason(req({ 'content-type': 'application/json' }))).toMatch(/Origin/);
    expect(rejectReason(req({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }))).toMatch(/Origin/);
    expect(rejectReason(req({ 'content-type': 'application/json', 'sec-fetch-site': 'none' }))).toMatch(/Origin/);
  });

  it('only mounts on the preview server when explicitly opted in', () => {
    const mount = (allowPreview: boolean): number => {
      let mounted = 0;
      const server = { middlewares: { use: () => void mounted++ } };
      const hook = devinBugReportPlugin({ allowPreview }).configurePreviewServer;
      (hook as unknown as (s: typeof server) => void)(server);
      return mounted;
    };
    expect(mount(false)).toBe(0);
    expect(mount(true)).toBe(1);
  });
});
