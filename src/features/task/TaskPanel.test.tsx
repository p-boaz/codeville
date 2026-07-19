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
        onRefresh={vi.fn()}
        skillOptions={[]}
        equippedSkills={[]}
        onToggleSkill={vi.fn()}
        proof={null}
        handoffNotice={null}
        error={null}
        feed={[]} onTaskChange={vi.fn()}
        onChooseProject={vi.fn()}
        onEmptyLot={vi.fn()}
        hasDemoLots={false}
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
  });

  it('offers repo-specific skills before overarching ones and reports equipped state', () => {
    const onToggleSkill = vi.fn();
    render(
      <TaskPanel
        environment={{ codexAvailable: true, codexVersion: 'codex-cli 0.144.4', model: 'gpt-5.6-sol', platform: 'darwin' }}
        project={{ projectId: 'project-1', path: '/safe/acorn', name: 'Acorn', slot: 0, isDemo: false }}
        task="" session={initialSessionState} sessionActive={false} progress={null}
        pendingInput={null} inputSubmitting={false} inputError={null}
        pendingScaffold={null} sessionDiff={null} landingBusy={false} landingError={null}
        onLoadDiff={vi.fn()} onCloseDiff={vi.fn()} onApply={vi.fn()} onKeep={vi.fn()} onDiscard={vi.fn()}
        onAddOrder={vi.fn()} onDeleteOrder={vi.fn()} onStartNextOrder={vi.fn()}
        onSteer={vi.fn()} onOpenScaffold={vi.fn()} onRefresh={vi.fn()}
        skillOptions={[
          { name: 'house-style', description: 'Overarching skill', scope: 'user', path: '/skills/house-style' },
          { name: 'repo-helper', description: 'Repo skill', scope: 'repo', path: '/repo/.codex/skills/helper' },
        ]}
        equippedSkills={['repo-helper']}
        onToggleSkill={onToggleSkill}
        proof={null} handoffNotice={null} error={null}
        feed={[]} onTaskChange={vi.fn()} onChooseProject={vi.fn()} onEmptyLot={vi.fn()} hasDemoLots={false} onUseDemoVillage={vi.fn()} onStart={vi.fn()} onInterrupt={vi.fn()}
        onSubmitInput={vi.fn()} onHandoff={vi.fn()} onReclaim={vi.fn()} onNewTask={vi.fn()} onResetVillage={vi.fn()}
      />,
    );
    const chips = screen.getAllByRole('button', { name: /repo-helper|house-style/ });
    expect(chips[0]).toHaveTextContent('repo-helper');
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    expect(chips[1]).toHaveTextContent('house-style');
    expect(chips[1]).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chips[1]);
    expect(onToggleSkill).toHaveBeenCalledWith('house-style');
  });

  it('offers labeled change and empty-lot actions and scopes the reset label to real villages', () => {
    const onEmptyLot = vi.fn();
    render(
      <TaskPanel
        environment={{ codexAvailable: true, codexVersion: 'codex-cli 0.144.4', model: 'gpt-5.6-sol', platform: 'darwin' }}
        project={{ projectId: 'project-1', path: '/safe/acorn', name: 'Acorn', slot: 0, isDemo: false }}
        task="" session={initialSessionState} sessionActive={false} progress={null}
        pendingInput={null} inputSubmitting={false} inputError={null}
        pendingScaffold={null} sessionDiff={null} landingBusy={false} landingError={null}
        onLoadDiff={vi.fn()} onCloseDiff={vi.fn()} onApply={vi.fn()} onKeep={vi.fn()} onDiscard={vi.fn()}
        onAddOrder={vi.fn()} onDeleteOrder={vi.fn()} onStartNextOrder={vi.fn()}
        onSteer={vi.fn()} onOpenScaffold={vi.fn()} onRefresh={vi.fn()}
        skillOptions={[]} equippedSkills={[]} onToggleSkill={vi.fn()}
        proof={null} handoffNotice={null} error={null}
        feed={[
          { id: 'f1', projectId: 'project-2', name: 'graphletter', taskTag: 'qa review', label: 'Editing App.tsx · styles.css', tone: 'active', at: '2026-07-18T01:00:00.000Z' },
          { id: 'f2', projectId: 'project-1', name: 'kalshi-mlb', taskTag: 'strategy review', label: 'Running pnpm vitest run', tone: 'active', at: '2026-07-18T01:00:05.000Z' },
        ]}
        onTaskChange={vi.fn()} onChooseProject={vi.fn()} onEmptyLot={onEmptyLot} hasDemoLots={false} onUseDemoVillage={vi.fn()} onStart={vi.fn()} onInterrupt={vi.fn()}
        onSubmitInput={vi.fn()} onHandoff={vi.fn()} onReclaim={vi.fn()} onNewTask={vi.fn()} onResetVillage={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Change repository' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Empty this lot' }));
    expect(onEmptyLot).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Reset village…' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reset demo village' })).toBeNull();

    // The village feed shows every builder newest-first with its task tag.
    const rows = screen.getAllByRole('listitem').filter((row) => row.textContent?.includes('·'));
    expect(rows[0]).toHaveTextContent('kalshi-mlb · strategy review');
    expect(rows[0]).toHaveTextContent('Running pnpm vitest run');
    expect(rows[1]).toHaveTextContent('graphletter · qa review');
    expect(rows[1]).toHaveTextContent('Editing App.tsx · styles.css');
  });

  it('queues a recommended follow-up as the next work order in one click', () => {
    const onAddOrder = vi.fn();
    render(
      <TaskPanel
        environment={{ codexAvailable: true, codexVersion: 'codex-cli 0.144.4', model: 'gpt-5.6-sol', platform: 'darwin' }}
        project={{ projectId: 'project-1', path: '/safe/acorn', name: 'Acorn', slot: 0, isDemo: false }}
        task="" session={initialSessionState} sessionActive={false}
        progress={{ projectId: 'project-1', repositoryPath: '/safe/acorn', repositoryName: 'Acorn', isDemo: false, level: 1, completedSessions: 1, lastCompletedAt: '2026-07-18T00:00:00.000Z', lastDebrief: { landed: 'Health checks tightened.', followUp: 'Add coverage for the retry path.', followUpRecommended: true }, lastThreadId: null, conversationStatus: 'idle', pendingInput: null, handoffAt: null, safeEventCount: 0, lastTurnStartedAt: null, history: [], queue: [] }}
        pendingInput={null} inputSubmitting={false} inputError={null}
        pendingScaffold={null} sessionDiff={null} landingBusy={false} landingError={null}
        onLoadDiff={vi.fn()} onCloseDiff={vi.fn()} onApply={vi.fn()} onKeep={vi.fn()} onDiscard={vi.fn()}
        onAddOrder={onAddOrder} onDeleteOrder={vi.fn()} onStartNextOrder={vi.fn()}
        onSteer={vi.fn()} onOpenScaffold={vi.fn()} onRefresh={vi.fn()}
        skillOptions={[]} equippedSkills={[]} onToggleSkill={vi.fn()}
        proof={null} handoffNotice={null} error={null}
        feed={[]} onTaskChange={vi.fn()} onChooseProject={vi.fn()} onEmptyLot={vi.fn()} hasDemoLots={false} onUseDemoVillage={vi.fn()} onStart={vi.fn()} onInterrupt={vi.fn()}
        onSubmitInput={vi.fn()} onHandoff={vi.fn()} onReclaim={vi.fn()} onNewTask={vi.fn()} onResetVillage={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Queue as next work order' }));
    expect(onAddOrder).toHaveBeenCalledWith('Add coverage for the retry path.');
  });

  it('shows metadata proof and disables Ghostty handoff while a turn is active', () => {
    render(<TaskPanel
      environment={{ codexAvailable: true, codexVersion: 'codex-cli 0.144.4', model: 'gpt-5.6-sol', platform: 'darwin' }}
      project={{ projectId: 'project-1', path: '/safe/acorn', name: 'Acorn', slot: 0, isDemo: true }} task="Fix it"
      session={{ ...initialSessionState, phase: 'editing' }} sessionActive
      progress={{ projectId: 'project-1', repositoryPath: '/safe/acorn', repositoryName: 'Acorn', isDemo: true, level: 0, completedSessions: 0, lastCompletedAt: null, lastDebrief: null, lastThreadId: 'thread-1', conversationStatus: 'idle', pendingInput: null, handoffAt: null, safeEventCount: 4, lastTurnStartedAt: null, history: [], queue: [] }}
      pendingInput={null} inputSubmitting={false} inputError={null} pendingScaffold={null} sessionDiff={null} landingBusy={false} landingError={null} onLoadDiff={vi.fn()} onCloseDiff={vi.fn()} onApply={vi.fn()} onKeep={vi.fn()} onDiscard={vi.fn()} onAddOrder={vi.fn()} onDeleteOrder={vi.fn()} onStartNextOrder={vi.fn()} onSteer={vi.fn()} onOpenScaffold={vi.fn()} onRefresh={vi.fn()} skillOptions={[]} equippedSkills={[]} onToggleSkill={vi.fn()} handoffNotice={null} error={null}
      proof={{ connected: true, appServerPid: 123, codexVersion: 'codex-cli 0.144.4', model: 'gpt-5.6-sol', repositoryName: 'Acorn', repositoryPath: '/safe/acorn', threadId: 'thread-1', activeTurnId: 'turn-1', safeEventCount: 4, connectedAt: null, turnStartedAt: null }}
      feed={[]} onTaskChange={vi.fn()} onChooseProject={vi.fn()} onEmptyLot={vi.fn()} hasDemoLots onUseDemoVillage={vi.fn()} onStart={vi.fn()} onInterrupt={vi.fn()} onSubmitInput={vi.fn()} onHandoff={vi.fn()} onReclaim={vi.fn()} onNewTask={vi.fn()} onResetVillage={vi.fn()}
    />);
    expect(screen.getByText('Codex connection proof')).toBeVisible();
    expect(screen.getByRole('button', { name: /continue in ghostty/i })).toBeDisabled();
    fireEvent.click(screen.getByText('Codex connection proof'));
    expect(screen.getByText('PID 123')).toBeVisible();
    expect(screen.getByText('/safe/acorn')).toBeVisible();
  });
});
