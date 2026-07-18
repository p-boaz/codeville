import type { ApprovalRequestView } from '../src/shared/village-events';
import type { ServerRequest } from './codex/generated/ServerRequest';

export function approvalView(request: ServerRequest, projectId: string): ApprovalRequestView {
  const base = { requestId: String(request.id), projectId };
  switch (request.method) {
    case 'item/commandExecution/requestApproval':
      return { ...base, category: 'command', title: 'Codex wants to run a command', explanation: request.params.reason ?? 'Review the exact local command before allowing it.', command: request.params.command ?? undefined, cwd: request.params.cwd ?? undefined };
    case 'item/fileChange/requestApproval':
      return { ...base, category: 'file_change', title: 'Codex needs permission to change files', explanation: request.params.reason ?? 'Review this request before allowing the file change.' };
    case 'item/permissions/requestApproval':
      return { ...base, category: 'permissions', title: 'Codex requested additional permissions', explanation: request.params.reason ?? 'Review the requested local permission expansion.', cwd: request.params.cwd };
    default:
      throw new Error(`Unsupported interactive Codex request: ${request.method}`);
  }
}

