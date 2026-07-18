import { fireEvent, render, screen } from '@testing-library/react';
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
        progress={null}
        pendingInput={null}
        inputSubmitting={false}
        inputError={null}
        pendingScaffold={null}
        sessionDiff={null}
        landingBusy={false}
        landingError={null}
        onLoadDiff={vi.fn()}
        onCloseDiff={vi.fn()}
        onApply={vi.fn()}
        onKeep={vi.fn()}
        onDiscard={vi.fn()}
        onAddOrder={vi.fn()}
        onDeleteOrder={vi.fn()}
        onStartNextOrder={vi.fn()}
        onSteer={vi.fn()}
        onOpenScaffold={vi.fn()}
        proof={null}
        handoffNotice={null}
        error={null}
        onTaskChange={vi.fn()}
        onChooseProject={vi.fn()}
        onUseDemoVillage={vi.fn()}
        onStart={vi.fn()}
        onInterrupt={vi.fn()}
        onSubmitInput={vi.fn()}
        onHandoff={vi.fn()}
        onReclaim={vi.fn()}
        onNewTask={vi.fn()}
        onResetVillage={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /start building/i })).toBeDisabled();
    expect(screen.getByText(/private by construction/i)).toBeVisible();
  });

  it('shows metadata proof and disables Ghostty handoff while a turn is active', () => {
    render(<TaskPanel
      environment={{ codexAvailable: true, codexVersion: 'codex-cli 0.144.4', model: 'gpt-5.6-sol', platform: 'darwin' }}
      project={{ projectId: 'project-1', path: '/safe/acorn', name: 'Acorn', slot: 0, isDemo: true }} task="Fix it"
      session={{ ...initialSessionState, phase: 'editing' }} sessionActive
      progress={{ projectId: 'project-1', repositoryPath: '/safe/acorn', repositoryName: 'Acorn', isDemo: true, level: 0, completedSessions: 0, lastCompletedAt: null, lastDebrief: null, lastThreadId: 'thread-1', conversationStatus: 'idle', pendingInput: null, handoffAt: null, safeEventCount: 4, lastTurnStartedAt: null, history: [], queue: [] }}
      pendingInput={null} inputSubmitting={false} inputError={null} pendingScaffold={null} sessionDiff={null} landingBusy={false} landingError={null} onLoadDiff={vi.fn()} onCloseDiff={vi.fn()} onApply={vi.fn()} onKeep={vi.fn()} onDiscard={vi.fn()} onAddOrder={vi.fn()} onDeleteOrder={vi.fn()} onStartNextOrder={vi.fn()} onSteer={vi.fn()} onOpenScaffold={vi.fn()} handoffNotice={null} error={null}
      proof={{ connected: true, appServerPid: 123, codexVersion: 'codex-cli 0.144.4', model: 'gpt-5.6-sol', repositoryName: 'Acorn', repositoryPath: '/safe/acorn', threadId: 'thread-1', activeTurnId: 'turn-1', safeEventCount: 4, connectedAt: null, turnStartedAt: null }}
      onTaskChange={vi.fn()} onChooseProject={vi.fn()} onUseDemoVillage={vi.fn()} onStart={vi.fn()} onInterrupt={vi.fn()} onSubmitInput={vi.fn()} onHandoff={vi.fn()} onReclaim={vi.fn()} onNewTask={vi.fn()} onResetVillage={vi.fn()}
    />);
    expect(screen.getByText('Codex connection proof')).toBeVisible();
    expect(screen.getByRole('button', { name: /continue in ghostty/i })).toBeDisabled();
    fireEvent.click(screen.getByText('Codex connection proof'));
    expect(screen.getByText('PID 123')).toBeVisible();
    expect(screen.getByText('/safe/acorn')).toBeVisible();
  });
});
