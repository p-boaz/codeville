import type { ServerNotification } from '../../electron/codex/generated/ServerNotification';
import type { ServerRequest } from '../../electron/codex/generated/ServerRequest';
import type { ThreadItem } from '../../electron/codex/generated/v2/ThreadItem';
import type { CommandCategory, VillageEvent } from '../shared/village-events';

export type RawCodexMessage = ServerNotification | ServerRequest;

export function translateCodexMessage(
  message: RawCodexMessage,
  context: { model: string; now?: () => Date },
): VillageEvent[] {
  const at = (context.now ?? (() => new Date()))().toISOString();

  switch (message.method) {
    case 'turn/started':
      return [{ type: 'session_started', at, model: context.model }];
    case 'turn/plan/updated':
    case 'item/plan/delta':
    case 'item/reasoning/summaryPartAdded':
    case 'item/reasoning/summaryTextDelta':
      return [{ type: 'planning', at }];
    case 'item/started':
      return translateItemStarted(message.params.item, at);
    case 'item/completed':
      return translateItemCompleted(message.params.item, at);
    case 'item/commandExecution/requestApproval':
      return [{ type: 'approval_required', at, requestId: String(message.id), category: 'command' }];
    case 'item/fileChange/requestApproval':
      return [{ type: 'approval_required', at, requestId: String(message.id), category: 'file_change' }];
    case 'item/permissions/requestApproval':
      return [{ type: 'approval_required', at, requestId: String(message.id), category: 'permissions' }];
    case 'turn/completed':
      if (message.params.turn.status === 'completed') return [{ type: 'session_completed', at }];
      if (message.params.turn.status === 'interrupted') return [{ type: 'session_interrupted', at }];
      return [{ type: 'session_failed', at, recoverable: true }];
    case 'error':
      return [{ type: 'session_failed', at, recoverable: true }];
    default:
      return [];
  }
}

function translateItemStarted(item: ThreadItem, at: string): VillageEvent[] {
  switch (item.type) {
    case 'plan':
    case 'reasoning':
      return [{ type: 'planning', at }];
    case 'fileChange':
      return [{ type: 'editing', at, quantity: item.changes.length }];
    case 'commandExecution': {
      if (item.commandActions.length > 0 && item.commandActions.every((action) => action.type !== 'unknown')) {
        return [{ type: 'reading', at, quantity: item.commandActions.length }];
      }
      return [{ type: 'running_command', at, category: categorizeCommand(item.command) }];
    }
    default:
      return [];
  }
}

function translateItemCompleted(item: ThreadItem, at: string): VillageEvent[] {
  if (item.type !== 'commandExecution') return [];
  const category = categorizeCommand(item.command);
  if (category !== 'test') return [];
  return [
    item.status === 'completed' && item.exitCode === 0
      ? { type: 'tests_passed', at }
      : { type: 'tests_failed', at },
  ];
}

export function categorizeCommand(command: string): CommandCategory {
  const normalized = command.toLowerCase();
  if (/\b(vitest|jest|pytest|rspec|mocha|go test|cargo test|pnpm test|npm test|yarn test)\b/.test(normalized)) {
    return 'test';
  }
  if (/\b(eslint|stylelint|ruff|biome|pnpm lint|npm run lint|yarn lint)\b/.test(normalized)) {
    return 'lint';
  }
  if (/\b(vite build|tsc|cargo build|go build|pnpm build|npm run build|yarn build)\b/.test(normalized)) {
    return 'build';
  }
  return 'other';
}
