import { describe, expect, it } from 'vitest';
import { buildPrompt, createDevinSession, type BugReportPayload } from '../server/bugReport.ts';
import { formatReport, githubIssueUrl } from '../src/bugReportFormat.ts';

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
