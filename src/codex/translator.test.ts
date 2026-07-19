import { describe, expect, it } from 'vitest';

import type { ServerNotification } from '../../electron/codex/generated/ServerNotification';
import { categorizeCommand, translateCodexMessage } from './translator';

const now = () => new Date('2026-07-18T00:00:00.000Z');

describe('Codex event translator', () => {
  it('carries the command text alongside its category for the desk feed', () => {
    const message = {
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        startedAtMs: 1,
        item: {
          type: 'commandExecution',
          id: 'item-1',
          command: 'pnpm vitest run --no-file-parallelism',
          cwd: '/private/project',
          processId: null,
          source: 'agent',
          status: 'inProgress',
          commandActions: [{ type: 'unknown', command: 'pnpm vitest run' }],
          aggregatedOutput: null,
          exitCode: null,
          durationMs: null,
        },
      },
    } satisfies ServerNotification;

    expect(translateCodexMessage(message, { model: 'gpt-5.6-sol', now })).toEqual([
      { type: 'running_command', at: '2026-07-18T00:00:00.000Z', category: 'test', command: 'pnpm vitest run --no-file-parallelism' },
    ]);
  });

  it('names the files a reading step touches', () => {
    const message = {
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        startedAtMs: 1,
        item: {
          type: 'commandExecution',
          id: 'item-1',
          command: 'cat src/App.tsx && rg "feed" src',
          cwd: '/private/project',
          processId: null,
          source: 'agent',
          status: 'inProgress',
          commandActions: [
            { type: 'read', command: 'cat src/App.tsx', name: 'App.tsx', path: '/private/project/src/App.tsx' },
            { type: 'search', command: 'rg "feed" src', query: 'feed', path: 'src' },
          ],
          aggregatedOutput: null,
          exitCode: null,
          durationMs: null,
        },
      },
    } satisfies ServerNotification;

    expect(translateCodexMessage(message, { model: 'gpt-5.6-sol', now })).toEqual([
      { type: 'reading', at: '2026-07-18T00:00:00.000Z', quantity: 2, detail: 'App.tsx · "feed"' },
    ]);
  });

  it('names the files an editing step changes', () => {
    const message = {
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        startedAtMs: 1,
        item: {
          type: 'fileChange',
          id: 'item-1',
          status: 'inProgress',
          changes: [
            { path: '/private/project/src/App.tsx', kind: { type: 'update', move_path: null }, diff: 'raw diff never leaves' },
            { path: '/private/project/src/styles.css', kind: { type: 'update', move_path: null }, diff: 'raw diff never leaves' },
          ],
        },
      },
    } satisfies ServerNotification;

    const events = translateCodexMessage(message, { model: 'gpt-5.6-sol', now });
    expect(events).toEqual([
      { type: 'editing', at: '2026-07-18T00:00:00.000Z', quantity: 2, detail: 'App.tsx · styles.css' },
    ]);
    expect(JSON.stringify(events)).not.toContain('raw diff');
  });

  it('drops command text with secret- or URL-shaped content, keeping category only', () => {
    const item = {
      type: 'commandExecution',
      id: 'item-1',
      cwd: '/private/project',
      processId: null,
      source: 'agent',
      status: 'inProgress',
      commandActions: [{ type: 'unknown', command: 'curl' }],
      aggregatedOutput: null,
      exitCode: null,
      durationMs: null,
    };
    for (const command of ['curl -H "Authorization: Bearer sk-live-abc123"', 'git push https://internal.example.com/repo', 'export API_KEY=leak && ./run']) {
      const message = { method: 'item/started', params: { threadId: 't', turnId: 'turn', startedAtMs: 1, item: { ...item, command } } } as ServerNotification;
      const [event] = translateCodexMessage(message, { model: 'gpt-5.6-sol', now });
      expect(event).toMatchObject({ type: 'running_command' });
      expect(JSON.stringify(event)).not.toMatch(/sk-live|example\.com|API_KEY/);
    }
  });

  it('never carries the working directory or command output into events', () => {
    const message = {
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        startedAtMs: 1,
        item: {
          type: 'commandExecution',
          id: 'item-1',
          command: 'pnpm test',
          cwd: '/private/project',
          processId: null,
          source: 'agent',
          status: 'inProgress',
          commandActions: [{ type: 'unknown', command: 'pnpm test' }],
          aggregatedOutput: 'raw stdout never leaves',
          exitCode: null,
          durationMs: null,
        },
      },
    } satisfies ServerNotification;

    const serialized = JSON.stringify(translateCodexMessage(message, { model: 'gpt-5.6-sol', now }));
    expect(serialized).not.toContain('/private/project');
    expect(serialized).not.toContain('raw stdout');
  });

  it('maps a successful test completion to inspection success', () => {
    const message = {
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        completedAtMs: 1,
        item: {
          type: 'commandExecution',
          id: 'item-1',
          command: 'pnpm test',
          cwd: '/private/project',
          processId: null,
          source: 'agent',
          status: 'completed',
          commandActions: [{ type: 'unknown', command: 'pnpm test' }],
          aggregatedOutput: 'all good',
          exitCode: 0,
          durationMs: 100,
        },
      },
    } satisfies ServerNotification;

    expect(translateCodexMessage(message, { model: 'gpt-5.6-sol', now })).toEqual([
      { type: 'tests_passed', at: '2026-07-18T00:00:00.000Z' },
    ]);
  });

  it.each([
    ['pnpm test', 'test'],
    ['npx eslint .', 'lint'],
    ['vite build', 'build'],
    ['git status', 'other'],
  ] as const)('categorizes %s as %s', (command, category) => {
    expect(categorizeCommand(command)).toBe(category);
  });

  it('requires a valid result before emitting completion', () => {
    const message = { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } } as ServerNotification;
    expect(translateCodexMessage(message, { model: 'gpt-5.6-sol', now, completionResult: null })).toEqual([{ type: 'session_needs_review', at: '2026-07-18T00:00:00.000Z' }]);
    expect(translateCodexMessage(message, { model: 'gpt-5.6-sol', now, completionResult: { status: 'waiting_for_input', pendingInput: { source: 'terminal', title: 'Builder needs direction', questions: [{ id: 'reply', header: 'Reply', question: 'Which channel?', isSecret: false, choices: [] }] } } })).toEqual([{ type: 'input_required', at: '2026-07-18T00:00:00.000Z', input: { source: 'terminal', title: 'Builder needs direction', questions: [{ id: 'reply', header: 'Reply', question: 'Which channel?', isSecret: false, choices: [] }] } }]);
  });
});
