/** Pure text formatting for bug reports (no DOM), shared by the dialog and tests. */

export type ReportContext = Record<string, unknown>;

export function contextLines(context: ReportContext): string[] {
  return Object.entries(context).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
}

export function formatReport(description: string, context: ReportContext): string {
  return `ARCADE BATTLESHIP BUG REPORT\n\n${description.trim() || '(no description)'}\n\n--- context ---\n${contextLines(context).join('\n')}`;
}

/** Prefilled "new issue" link. Devin picks these up once the repo is connected to it. */
export function githubIssueUrl(repo: string, description: string, context: ReportContext): string {
  const title = `Bug: ${description.trim().split('\n')[0]?.slice(0, 70) || 'untitled report from the game'}`;
  const body = [
    '## What happened',
    description.trim() || '_(no description)_',
    '',
    '## Captured context',
    '```',
    ...contextLines(context),
    '```',
    '',
    '_Filed from the in-game REPORT BUG button._',
    '@devin please reproduce this (`npm run dev`, then `npm run smoke` drives every screen), fix the root cause in `src/`, add a regression test where practical, and open a PR.',
  ].join('\n');
  return newIssueUrl(repo, title, body, 'bug');
}

export interface CrashInfo {
  readonly message: string;
  readonly stack?: string;
}

/** Prefilled "new issue" link for an uncaught error; labelled `crash` so automations can find them. */
export function githubCrashIssueUrl(repo: string, crash: CrashInfo, context: ReportContext): string {
  const firstLine = crash.message.split('\n')[0]?.trim() || 'unknown error';
  const title = `Crash: ${firstLine.slice(0, 70)}`;
  const body = [
    '## Uncaught error',
    '```',
    (crash.stack?.trim() || crash.message).slice(0, 3000),
    '```',
    '',
    '## Captured context',
    '```',
    ...contextLines(context),
    '```',
    '',
    '_Filed automatically from the in-game crash banner._',
    '@devin please reproduce this (`npm run dev`, then `npm run smoke` drives every screen), fix the root cause in `src/`, add a regression test where practical, and open a PR.',
  ].join('\n');
  return newIssueUrl(repo, title, body, 'bug,crash');
}

function newIssueUrl(repo: string, title: string, body: string, labels: string): string {
  const params = new URLSearchParams({ title, body, labels });
  return `${repo.replace(/\/$/, '')}/issues/new?${params.toString()}`;
}
