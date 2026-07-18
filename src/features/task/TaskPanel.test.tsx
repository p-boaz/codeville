import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { initialSessionState } from '../../state/session-machine';
import { TaskPanel } from './TaskPanel';

describe('TaskPanel', () => {
  it('keeps the start action disabled until Codex and a project are ready', () => {
    render(
      <TaskPanel
        environment={{ codexAvailable: true, codexVersion: 'codex-cli 0.144.4', model: 'gpt-5.6-sol', platform: 'darwin' }}
        project={null}
        task="Add a feature"
        session={initialSessionState}
        sessionActive={false}
        error={null}
        onTaskChange={vi.fn()}
        onChooseProject={vi.fn()}
        onUseDemoProject={vi.fn()}
        onStart={vi.fn()}
        onInterrupt={vi.fn()}
        onNewTask={vi.fn()}
        onResetVillage={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /start building/i })).toBeDisabled();
    expect(screen.getByText(/private by construction/i)).toBeVisible();
  });
});
