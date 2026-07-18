import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BatchLaunchDialog } from './BatchLaunchDialog';

describe('BatchLaunchDialog', () => {
  it('shows exact repositories and tasks and blocks launch until explicit confirmation', () => {
    const confirm = vi.fn();
    render(<BatchLaunchDialog projects={[
      { projectId: 'one', projectName: 'graphletter', projectPath: '/Users/dev/graphletter', task: 'Improve graph export' },
      { projectId: 'two', projectName: 'kalshi-mlb', projectPath: '/Users/dev/kalshi-mlb', task: 'Verify market ingestion' },
    ]} onCancel={vi.fn()} onConfirm={confirm} />);

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText('/Users/dev/graphletter')).toBeVisible();
    expect(screen.getByText('Verify market ingestion')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /confirm and start builders/i }));
    expect(confirm).toHaveBeenCalledOnce();
  });
});

