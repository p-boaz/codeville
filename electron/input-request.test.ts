import { describe, expect, it } from 'vitest';

import type { ServerRequest } from './codex/generated/ServerRequest';
import { approvalView } from './approval-request';
import { inputRequestView, inputResponse } from './input-request';

const nativeRequest = {
  method: 'item/tool/requestUserInput', id: 91,
  params: {
    threadId: 'thread-a', turnId: 'turn-a', itemId: 'item-a', autoResolutionMs: null,
    questions: [
      { id: 'channel', header: 'Channel', question: 'Which release channel?', isOther: true, isSecret: false, options: [{ label: 'Stable', description: 'Ship broadly' }, { label: 'Preview', description: 'Ship carefully' }] },
      { id: 'credential', header: 'Credential', question: 'Enter the temporary credential.', isOther: true, isSecret: true, options: null },
    ],
  },
} satisfies ServerRequest;

describe('native input protocol', () => {
  it('routes multiple questions to the exact project and preserves secret masking metadata', () => {
    const view = inputRequestView(nativeRequest, 'project-a');
    expect(view).toMatchObject({ requestId: '91', projectId: 'project-a', source: 'native' });
    expect(view.questions).toEqual([
      { id: 'channel', header: 'Channel', question: 'Which release channel?', isSecret: false, choices: ['Stable', 'Preview'] },
      { id: 'credential', header: 'Credential', question: 'Enter the temporary credential.', isSecret: true, choices: [] },
    ]);
    expect(JSON.stringify(view)).not.toContain('Ship broadly');
  });

  it('builds the generated response shape without retaining answers', () => {
    expect(inputResponse(nativeRequest, [
      { questionId: 'channel', answers: ['Preview'] },
      { questionId: 'credential', answers: ['private-value'] },
    ])).toEqual({ answers: { channel: { answers: ['Preview'] }, credential: { answers: ['private-value'] } } });
  });

  it('keeps input and approval request shapes independent and project-scoped', () => {
    const approval = { method: 'item/fileChange/requestApproval', id: 92, params: { threadId: 'thread-b', turnId: 'turn-b', itemId: 'item-b', reason: null, grantRoot: null, startedAtMs: 1 } } satisfies ServerRequest;
    expect(inputRequestView(nativeRequest, 'project-a').projectId).toBe('project-a');
    expect(approvalView(approval, 'project-b').projectId).toBe('project-b');
  });
});
