import type { ServerNotification } from '../../electron/codex/generated/ServerNotification';
import type { ServerRequest } from '../../electron/codex/generated/ServerRequest';
import type { ThreadItem } from '../../electron/codex/generated/v2/ThreadItem';
import type { CodevilleResult, CommandCategory, VillageEvent } from '../shared/village-events';

export type RawCodexMessage = ServerNotification | ServerRequest;

export function translateCodexMessage(
  message: RawCodexMessage,
  context: { model: string; now?: () => Date; completionResult?: CodevilleResult | null },
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
      if (message.params.turn.status === 'completed') {
        if (context.completionResult?.status === 'completed') return [{ type: 'session_completed', at, debrief: context.completionResult.debrief }];
        if (context.completionResult?.status === 'waiting_for_input') return [{ type: 'input_required', at, input: context.completionResult.pendingInput }];
        return [{ type: 'session_needs_review', at }];
      }
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
      return [{ type: 'editing', at, quantity: item.changes.length, detail: describeItems(item.changes.map((change) => baseName(change.path))) }];
    case 'commandExecution': {
      if (item.commandActions.length > 0 && item.commandActions.every((action) => action.type !== 'unknown')) {
        const named = item.commandActions
          .map((action) => (action.type === 'read' ? action.name : action.type === 'search' && action.query ? `"${action.query}"` : null))
          .filter((name): name is string => Boolean(name));
        return [{ type: 'reading', at, quantity: item.commandActions.length, detail: describeItems(named) }];
      }
      return [{ type: 'running_command', at, category: categorizeCommand(item.command), command: safeCommandText(item.command) }];
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

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Command text reaches the desk feed; screen it for secret- and URL-shaped
// content and fall back to the category-only event when it trips.
function safeCommandText(command: string): string | undefined {
  const flattened = command.replace(/\s+/g, ' ').trim();
  if (/https?:|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(flattened)) return undefined;
  if (/\b(sk-[a-z0-9_-]+|api[_-]?key|secret|token|password|bearer|authorization)\b/i.test(flattened)) return undefined;
  return truncate(flattened, 80);
}

// Desk-feed detail line: up to three named items, then a remainder count.
function describeItems(names: string[]): string | undefined {
  if (names.length === 0) return undefined;
  const shown = names.slice(0, 3).join(' · ');
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown;
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
