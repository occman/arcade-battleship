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
  const params = new URLSearchParams({ title, body, labels: 'bug' });
  return `${repo.replace(/\/$/, '')}/issues/new?${params.toString()}`;
}
