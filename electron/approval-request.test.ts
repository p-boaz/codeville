import { describe, expect, it } from 'vitest';

import type { ServerRequest } from './codex/generated/ServerRequest';
import { approvalView } from './approval-request';

describe('approval request routing', () => {
  it('retains opaque project identity on a concurrent command approval', () => {
    const request = {
      id: 17,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: 'thread-2', turnId: 'turn-2', itemId: 'item-2', command: 'pnpm test', cwd: '/private/repo', reason: 'Run checks' },
    } as ServerRequest;
    expect(approvalView(request, 'project-kalshi')).toMatchObject({ requestId: '17', projectId: 'project-kalshi', category: 'command' });
  });
});

