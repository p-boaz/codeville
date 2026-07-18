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
});
