import { describe, expect, it } from 'vitest';

import type { ServerNotification } from '../../electron/codex/generated/ServerNotification';
import { categorizeCommand, translateCodexMessage } from './translator';

const now = () => new Date('2026-07-18T00:00:00.000Z');

describe('Codex event translator', () => {
  it('classifies commands without carrying command text into safe events', () => {
    const message = {
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        startedAtMs: 1,
        item: {
          type: 'commandExecution',
          id: 'item-1',
          command: 'pnpm test -- --runInBand SECRET_TOKEN=never-leak',
          cwd: '/private/project',
          processId: null,
          source: 'agent',
          status: 'inProgress',
          commandActions: [{ type: 'unknown', command: 'pnpm test' }],
          aggregatedOutput: null,
          exitCode: null,
          durationMs: null,
        },
      },
    } satisfies ServerNotification;

    const events = translateCodexMessage(message, { model: 'gpt-5.6-sol', now });
    const serialized = JSON.stringify(events);

    expect(events).toEqual([
      { type: 'running_command', at: '2026-07-18T00:00:00.000Z', category: 'test' },
    ]);
    expect(serialized).not.toContain('SECRET_TOKEN');
    expect(serialized).not.toContain('/private/project');
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
});
