import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InspectionCard } from './InspectionCard';

const scaffold = {
  projectId: 'project-1',
  branch: 'codeville/session-1',
  baseSubject: 'initial',
  createdAt: '2026-07-18T20:00:00.000Z',
  filesChanged: 2,
  insertions: 14,
  deletions: 3,
  outcome: {
    testsPassed: true,
    durationMs: 372_000,
    deskLanded: 'Implemented summarizeProject in src/health.js; all tests pass.',
    deskFollowUp: 'No follow-up recommended.',
    followUpRecommended: false,
  },
};

describe('InspectionCard', () => {
  it('shows verified counts and requires a second click before discarding', () => {
    const onDiscard = vi.fn();
    render(<InspectionCard scaffold={scaffold} diff={null} busy={false} error={null} onLoadDiff={vi.fn()} onCloseDiff={vi.fn()} onApply={vi.fn()} onKeep={vi.fn()} onDiscard={onDiscard} />);
    expect(screen.getByText('2 files changed')).toBeVisible();
    expect(screen.getByText('+14')).toBeVisible();
    expect(screen.getByLabelText('Verified session facts')).toHaveTextContent('tests passed · 6m 12s');
    expect(screen.getByText(/Implemented summarizeProject in src\/health\.js/)).toBeVisible();
    expect(screen.getByRole('button', { name: /install in repository/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /discard…/i }));
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /really discard/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('renders the loaded diff with per-file patches', () => {
    const diff = {
      projectId: 'project-1',
      branch: 'codeville/session-1',
      baseCommit: 'abc1234def',
      baseSubject: 'initial',
      filesChanged: 1,
      insertions: 1,
      deletions: 1,
      files: [{ path: 'src/health.js', insertions: 1, deletions: 1, patch: '-old line\n+new line' }],
    };
    render(<InspectionCard scaffold={scaffold} diff={diff} busy={false} error={null} onLoadDiff={vi.fn()} onCloseDiff={vi.fn()} onApply={vi.fn()} onKeep={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByText('src/health.js')).toBeVisible();
    expect(screen.getByText(/\+new line/)).toBeVisible();
  });
});
