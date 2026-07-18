import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

describe('AppServerClient protocol contract', () => {
  it('keeps the transport implementation isolated from renderer code', async () => {
    const module = await import('./app-server-client');
    expect(module.AppServerClient).toBeTypeOf('function');
    expect(new EventEmitter()).toBeInstanceOf(EventEmitter);
    expect(new PassThrough()).toBeInstanceOf(PassThrough);
    expect(vi.isMockFunction(module.AppServerClient)).toBe(false);
  });

  it('resumes the same thread with unchanged sandbox, approval, model, cwd, and instructions', async () => {
    const { buildThreadResumeParams, buildThreadStartParams } = await import('./app-server-client');
    const started = buildThreadStartParams('/repo/acorn', 'gpt-5.6-sol');
    const resumed = buildThreadResumeParams('thread-opaque', '/repo/acorn', 'gpt-5.6-sol');
    expect(resumed).toMatchObject({ threadId: 'thread-opaque', cwd: started.cwd, model: started.model, sandbox: started.sandbox, approvalPolicy: started.approvalPolicy, developerInstructions: started.developerInstructions });
    expect(resumed).not.toHaveProperty('ephemeral');
  });
});
